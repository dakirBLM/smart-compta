import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
import time
from threading import Lock
from pathlib import Path


MAX_PREVIEW_PDF_BYTES = 25 * 1024 * 1024
MAX_CACHED_PREVIEW_BYTES = 8 * 1024 * 1024
MAX_PREVIEW_CACHE_BYTES = 128 * 1024 * 1024
PREVIEW_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60
OFFICE_PREVIEW_TIMEOUT_SECONDS = 45
PREVIEW_CACHE_DIR = Path(tempfile.gettempdir()) / "smart-compta-office-preview-cache"
_cache_lock = Lock()
_conversion_lock = Lock()
logger = logging.getLogger(__name__)


class OfficePreviewUnavailable(Exception):
    pass


class OfficePreviewError(Exception):
    pass


def _find_libreoffice():
    configured_path = os.environ.get("LIBREOFFICE_PATH")
    if configured_path:
        configured_executable = shutil.which(configured_path)
        if configured_executable:
            return configured_executable
        configured_path = Path(configured_path).expanduser()
        if configured_path.is_file():
            return str(configured_path)

    for executable_name in ("libreoffice", "soffice"):
        executable_path = shutil.which(executable_name)
        if executable_path:
            return executable_path

    for executable_path in (
        Path(os.environ.get("PROGRAMFILES", "C:/Program Files"))
        / "LibreOffice/program/soffice.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)"))
        / "LibreOffice/program/soffice.exe",
    ):
        if executable_path.is_file():
            return str(executable_path)

    return None


def _cache_path(attachment_key):
    digest = hashlib.sha256(attachment_key.encode("utf-8")).hexdigest()
    return PREVIEW_CACHE_DIR / f"{digest}.pdf"


def _read_cached_preview(cache_path):
    try:
        stat = cache_path.stat()
        if time.time() - stat.st_mtime > PREVIEW_CACHE_MAX_AGE_SECONDS:
            cache_path.unlink(missing_ok=True)
            return None
        if stat.st_size > MAX_CACHED_PREVIEW_BYTES:
            cache_path.unlink(missing_ok=True)
            return None
        pdf_data = cache_path.read_bytes()
        if not pdf_data.startswith(b"%PDF-"):
            cache_path.unlink(missing_ok=True)
            return None
        os.utime(cache_path, None)
        return pdf_data
    except FileNotFoundError:
        return None
    except OSError:
        logger.warning("Could not read Office preview cache entry.", exc_info=True)
        return None


def _write_cached_preview(cache_path, pdf_data):
    if len(pdf_data) > MAX_CACHED_PREVIEW_BYTES:
        return

    try:
        PREVIEW_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=PREVIEW_CACHE_DIR,
            prefix="office-preview-",
            suffix=".tmp",
            delete=False,
        ) as cached_file:
            cached_file.write(pdf_data)
            temporary_path = Path(cached_file.name)

        os.replace(temporary_path, cache_path)

        with _cache_lock:
            entries = sorted(
                (
                    (path.stat().st_mtime, path.stat().st_size, path)
                    for path in PREVIEW_CACHE_DIR.glob("*.pdf")
                    if path != cache_path
                ),
                key=lambda entry: entry[0],
            )
            total_size = len(pdf_data) + sum(size for _, size, _ in entries)
            while entries and total_size > MAX_PREVIEW_CACHE_BYTES:
                _, size, oldest_path = entries.pop(0)
                oldest_path.unlink(missing_ok=True)
                total_size -= size
    except OSError:
        logger.warning("Could not write Office preview cache entry.", exc_info=True)


def convert_office_attachment_to_pdf(file_obj, extension, attachment_key=None):
    cache_path = _cache_path(attachment_key) if attachment_key else None
    if cache_path:
        cached_preview = _read_cached_preview(cache_path)
        if cached_preview is not None:
            return cached_preview

    executable = _find_libreoffice()
    if not executable:
        raise OfficePreviewUnavailable("LibreOffice is not installed.")

    try:
        with tempfile.TemporaryDirectory(prefix="smartcompta-preview-") as temp_dir:
            temp_path = Path(temp_dir)
            source_path = temp_path / f"attachment{extension}"
            output_path = temp_path / "attachment.pdf"
            profile_path = (
                Path(tempfile.gettempdir())
                / f"smart-compta-libreoffice-profile-{os.getpid()}"
            )
            profile_path.mkdir(parents=True, exist_ok=True)

            with source_path.open("wb") as source:
                shutil.copyfileobj(file_obj, source)

            with _conversion_lock:
                result = subprocess.run(
                    [
                        executable,
                        f"-env:UserInstallation={profile_path.as_uri()}",
                        "--headless",
                        "--convert-to",
                        "pdf",
                        "--outdir",
                        str(temp_path),
                        str(source_path),
                    ],
                    capture_output=True,
                    timeout=OFFICE_PREVIEW_TIMEOUT_SECONDS,
                    check=False,
                )
            if result.returncode != 0 or not output_path.is_file():
                raise OfficePreviewError("LibreOffice could not convert the attachment.")

            if output_path.stat().st_size > MAX_PREVIEW_PDF_BYTES:
                raise OfficePreviewError("The converted preview exceeds the size limit.")

            pdf_data = output_path.read_bytes()
            if not pdf_data.startswith(b"%PDF-"):
                raise OfficePreviewError("LibreOffice returned an invalid PDF.")
            if cache_path:
                _write_cached_preview(cache_path, pdf_data)
            return pdf_data
    except subprocess.TimeoutExpired as exc:
        raise OfficePreviewError("LibreOffice conversion timed out.") from exc
    except OSError as exc:
        raise OfficePreviewError("Could not read or convert the attachment.") from exc
