"""Everything a company leaves outside the database when it is deleted.

Deleting an Entreprise cascades to its rows (journals, invoices, banks, client
links, messages...). The files those rows point to live elsewhere (default
storage, Cloudinary, the local media folder). They are collected before the
delete and removed inside the same transaction, after the rows are gone: if a
file cannot be removed, the transaction rolls back and nothing is deleted.
"""
import logging
import os
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import FileSystemStorage

from .models import (
    BankStatementSubmission,
    Ecriture,
    Facture,
    MessageAttachment,
)

logger = logging.getLogger(__name__)

# https://res.cloudinary.com/<cloud>/image/upload/v<version>/<public_id>.<ext>
_CLOUDINARY_PUBLIC_ID = re.compile(r"/upload/(?:v\d+/)?(.+?)\.[A-Za-z0-9]+$")


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


class CompanyFilesError(Exception):
    """At least one company file could not be deleted."""

    def __init__(self, failures):
        self.failures = failures
        super().__init__("; ".join(failures))


def delete_invoice_image(url):
    """Remove a scanned invoice image from Cloudinary or the local media folder.

    Raises if the image cannot be removed, so the caller can stop the company
    delete instead of silently leaving the file behind.
    """
    media_url = settings.MEDIA_URL or ""
    if media_url and url.startswith(media_url):
        FileSystemStorage(location=str(settings.MEDIA_ROOT)).delete(url[len(media_url):])
        return
    if "res.cloudinary.com" in url:
        if not os.getenv("CLOUDINARY_URL"):
            raise RuntimeError("CLOUDINARY_URL n'est pas configuré")
        match = _CLOUDINARY_PUBLIC_ID.search(url)
        if not match:
            raise RuntimeError("URL Cloudinary non reconnue")
        import cloudinary.uploader

        result = cloudinary.uploader.destroy(match.group(1), resource_type="image")
        if result.get("result") not in ("ok", "not found"):
            raise RuntimeError(f"Cloudinary a refusé la suppression : {result}")


def delete_company_files(stored_files, image_urls):
    """Delete every company file. Raises CompanyFilesError if any of them fails.

    All files are attempted so the error lists every failure at once.
    """
    failures = []
    for storage, name in stored_files:
        try:
            storage.delete(name)
        except Exception as exc:
            logger.exception("Could not delete stored file %s", name)
            failures.append(f"{name} ({exc})")
    for url in image_urls:
        try:
            delete_invoice_image(url)
        except Exception as exc:
            logger.exception("Could not delete invoice image %s", url)
            failures.append(f"{url} ({exc})")
    if failures:
        raise CompanyFilesError(failures)


def remove_orphan_clients(client_ids):
    """Delete client logins that had access only to the deleted company."""
    User = get_user_model()
    for user in User.objects.filter(pk__in=client_ids, role=User.Role.CLIENT):
        if not user.accesses.exists():
            user.delete()
