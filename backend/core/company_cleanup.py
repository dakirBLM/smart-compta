"""Everything a company leaves outside the database when it is deleted.

Deleting an Entreprise cascades to its rows (journals, invoices, banks, client
links, messages...). The files those rows point to live elsewhere (default
storage, Cloudinary, the local media folder), so they are collected before the
delete and removed only after the delete commits.
"""
import logging
import os
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import FileSystemStorage
from django.db import transaction

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


def delete_invoice_image(url):
    """Remove a scanned invoice image from Cloudinary or the local media folder."""
    media_url = settings.MEDIA_URL or ""
    if media_url and url.startswith(media_url):
        FileSystemStorage(location=str(settings.MEDIA_ROOT)).delete(url[len(media_url):])
        return
    if "res.cloudinary.com" in url and os.getenv("CLOUDINARY_URL"):
        match = _CLOUDINARY_PUBLIC_ID.search(url)
        if match:
            import cloudinary.uploader

            cloudinary.uploader.destroy(match.group(1), resource_type="image")


def _remove(stored_files, image_urls):
    for storage, name in stored_files:
        try:
            storage.delete(name)
        except Exception:  # never fail the company delete because of a file
            logger.exception("Could not delete stored file %s", name)
    for url in image_urls:
        try:
            delete_invoice_image(url)
        except Exception:
            logger.exception("Could not delete invoice image %s", url)


def remove_files_after_commit(stored_files, image_urls):
    """Delete the files only once the database delete has really committed."""
    transaction.on_commit(lambda: _remove(stored_files, image_urls))


def remove_orphan_clients(client_ids):
    """Delete client logins that had access only to the deleted company."""
    User = get_user_model()
    for user in User.objects.filter(pk__in=client_ids, role=User.Role.CLIENT):
        if not user.accesses.exists():
            user.delete()
