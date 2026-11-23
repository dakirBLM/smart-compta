"""Remove a company's files without losing them if the delete fails.

Deleting an Entreprise cascades to its rows (journals, invoices, banks, client
links, messages...). The files those rows point to live elsewhere (default
storage, Cloudinary, the local media folder). The delete runs in three steps:

1. Move every file to a trash location (storage copy, or Cloudinary rename).
   The original is removed only after its trash copy exists.
2. Delete the company rows and the client logins that had no other company,
   in one database transaction.
3. If step 2 fails, move every file back from the trash and report the error.
   If step 2 succeeds, empty the trash.
"""
import logging
import os
import re
import uuid
from dataclasses import dataclass
from typing import Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage

from .models import (
    BankStatementSubmission,
    Ecriture,
    Facture,
    MessageAttachment,
)

logger = logging.getLogger(__name__)

STORAGE_TRASH_DIR = "_company_trash"
CLOUDINARY_TRASH_FOLDER = "smart-compta-trash"

# https://res.cloudinary.com/<cloud>/image/upload/v<version>/<public_id>.<ext>
_CLOUDINARY_PUBLIC_ID = re.compile(r"/upload/(?:v\d+/)?(.+?)\.[A-Za-z0-9]+$")


class CompanyFilesError(Exception):
    """At least one company file could not be moved or removed."""

    def __init__(self, failures):
        self.failures = failures
        super().__init__("; ".join(failures))


@dataclass
class TrashedFile:
    """A company file that now lives in the trash, with its original location."""

    storage: Optional[object]  # None for Cloudinary images
    original: str  # storage name, or Cloudinary public_id
    trash: str  # storage name, or Cloudinary public_id


def collect_company_files(entreprise):
    """Return (stored_files, image_urls) that belong only to this company."""
    stored_files = []
    for submission in BankStatementSubmission.objects.filter(entreprise=entreprise):
        if submission.file and submission.file.name:
            stored_files.append((submission.file.storage, submission.file.name))
    for attachment in MessageAttachment.objects.filter(message__entreprise=entreprise):
        if attachment.file and attachment.file.name:
            stored_files.append((attachment.file.storage, attachment.file.name))

    image_urls = set()
    image_urls.update(
        Facture.objects.filter(entreprise=entreprise)
        .exclude(image_url="").values_list("image_url", flat=True)
    )
    image_urls.update(
        Ecriture.objects.filter(journal__entreprise=entreprise)
        .exclude(image_url="").values_list("image_url", flat=True)
    )
    return stored_files, image_urls


def _cloudinary_uploader():
    if not os.getenv("CLOUDINARY_URL"):
        raise RuntimeError("CLOUDINARY_URL n'est pas configuré")
    import cloudinary.uploader

    return cloudinary.uploader


def _is_local_media(url):
    media_url = settings.MEDIA_URL or ""
    return bool(media_url) and url.startswith(media_url)


def _move_storage_file(storage, name):
    """Copy the file to the trash, then remove the original. None if it is gone."""
    if not storage.exists(name):
        return None
    with storage.open(name, "rb") as source:
        data = source.read()
    trash_name = storage.save(f"{STORAGE_TRASH_DIR}/{uuid.uuid4().hex}/{name}", ContentFile(data))
    try:
        storage.delete(name)
    except Exception:
        _safe_delete_storage(storage, trash_name)
        raise
    return TrashedFile(storage=storage, original=name, trash=trash_name)


def _move_cloudinary_image(url):
    """Rename the image into the trash folder. None if Cloudinary has no such image."""
    from cloudinary.exceptions import NotFound

    match = _CLOUDINARY_PUBLIC_ID.search(url)
    if not match:
        raise RuntimeError("URL Cloudinary non reconnue")
    public_id = match.group(1)
    trash_id = f"{CLOUDINARY_TRASH_FOLDER}/{uuid.uuid4().hex}/{public_id}"
    uploader = _cloudinary_uploader()
    try:
        result = uploader.rename(public_id, trash_id, resource_type="image")
    except NotFound:
        return None
    if not result.get("public_id"):
        raise RuntimeError(f"Cloudinary a refusé le déplacement : {result}")
    return TrashedFile(storage=None, original=public_id, trash=trash_id)


def _safe_delete_storage(storage, name):
    try:
        storage.delete(name)
    except Exception:
        logger.exception("Could not delete %s from storage", name)


def move_company_files_to_trash(stored_files, image_urls):
    """Step 1. Move every company file to the trash.

    If any file cannot be moved, the files already moved are put back and
    CompanyFilesError is raised, so nothing is left half-deleted.
    """
    trashed, failures = [], []
    for storage, name in stored_files:
        try:
            item = _move_storage_file(storage, name)
        except Exception as exc:
            logger.exception("Could not move stored file %s to trash", name)
            failures.append(f"{name} ({exc})")
            continue
        if item:
            trashed.append(item)

    for url in image_urls:
        try:
            if _is_local_media(url):
                item = _move_storage_file(
                    FileSystemStorage(location=str(settings.MEDIA_ROOT)),
                    url[len(settings.MEDIA_URL):],
                )
            else:
                item = _move_cloudinary_image(url)
        except Exception as exc:
            logger.exception("Could not move invoice image %s to trash", url)
            failures.append(f"{url} ({exc})")
            continue
        if item:
            trashed.append(item)

    if failures:
        restore_company_files(trashed)
        raise CompanyFilesError(failures)
    return trashed


def restore_company_files(trashed):
    """Step 3 (failure path). Put every trashed file back where it was."""
    failures = []
    for item in reversed(trashed):
        try:
            if item.storage is None:
                _cloudinary_uploader().rename(item.trash, item.original, resource_type="image")
                continue
            with item.storage.open(item.trash, "rb") as source:
                data = source.read()
            restored = item.storage.save(item.original, ContentFile(data))
            if restored != item.original:
                raise RuntimeError(f"nom restauré différent : {restored}")
            item.storage.delete(item.trash)
        except Exception as exc:
            logger.exception("Could not restore %s from trash %s", item.original, item.trash)
            failures.append(f"{item.original} (corbeille : {item.trash}, {exc})")
    if failures:
        logger.error("Company files still in trash: %s", failures)
    return failures


def purge_trash(trashed):
    """Step 3 (success path). Empty the trash once the company is deleted."""
    for item in trashed:
        try:
            if item.storage is None:
                _cloudinary_uploader().destroy(item.trash, resource_type="image")
            else:
                item.storage.delete(item.trash)
        except Exception:
            # The company is already gone; a leftover trash copy is only clutter.
            logger.exception("Could not empty trash item %s", item.trash)


def remove_orphan_clients(client_ids):
    """Delete client logins that had access only to the deleted company."""
    User = get_user_model()
    for user in User.objects.filter(pk__in=client_ids, role=User.Role.CLIENT):
        if not user.accesses.exists():
            user.delete()
