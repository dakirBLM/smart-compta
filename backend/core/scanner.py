"""Scanner bridge: forwards an invoice image to the AI WEBHOOK_URL and
persists the confirmed extraction as an Ecriture + LigneEcriture set."""
import base64
import json
import mimetypes
import os
import re
from datetime import datetime

import requests
from django.conf import settings
from django.db import transaction

from .models import Ecriture, ExerciceAnnee, Journal, LigneEcriture

REQUIRED_FIELDS = [
    "fournisseur", "date_facture", "numero_facture", "montant_ht",
    "tva_pourcentage", "montant_tva", "montant_ttc", "journal", "confiance",
    "lignes",
]

# Map the AI "journal" label to our Journal.Type values.
JOURNAL_MAP = {
    "achats": Journal.Type.ACHAT, "achat": Journal.Type.ACHAT,
    "ventes": Journal.Type.VENTE, "vente": Journal.Type.VENTE,
    "banque": Journal.Type.BANQUE,
    "caisse": Journal.Type.CAISSE,
    "od": Journal.Type.OD,
}


class WebhookError(Exception):
    pass


# Reject absurdly large PDF uploads before we even try to render them.
MAX_PDF_BYTES = 20 * 1024 * 1024


def _webhook_max_bytes():
    """Largest raw image we may send. Make caps an input value at 5 MB; in
    base64 mode the encoded string is ~33% bigger, so target ~3.6 MB raw."""
    mode = getattr(settings, "WEBHOOK_IMAGE_MODE", "multipart")
    return 3_600_000 if mode == "base64" else 4_800_000


def pdf_to_jpeg(pdf_bytes):
    """Render ALL pages of a PDF into a single stacked JPEG so the vision model
    receives the whole document (not just page 1). All-or-nothing: if the
    combined image cannot be compressed under the webhook's 5 MB limit, raise —
    we never silently drop pages.

    Used for PC imports where users upload a PDF instead of taking a photo.
    """
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise WebhookError(
            "PDF trop volumineux (max 20 Mo). Réduisez la taille du fichier."
        )
    try:
        import fitz  # PyMuPDF
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise WebhookError(
            "Le support PDF n'est pas installé sur le serveur (PyMuPDF/Pillow)."
        ) from exc

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise WebhookError(f"Impossible de lire le PDF: {exc}") from exc
    if doc.page_count == 0:
        raise WebhookError("Le PDF est vide.")

    import io

    max_bytes = _webhook_max_bytes()
    # Try progressively lower resolution / quality until it fits under the cap.
    for dpi in (170, 140, 110, 90, 72):
        pages = []
        for page in doc:
            pix = page.get_pixmap(dpi=dpi)
            pages.append(
                Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            )
        width = max(p.width for p in pages)
        total_h = sum(p.height for p in pages)
        combined = Image.new("RGB", (width, total_h), "white")
        y = 0
        for p in pages:
            combined.paste(p, (0, y))
            y += p.height
        for quality in (85, 75, 65, 55, 45):
            buf = io.BytesIO()
            combined.save(buf, "JPEG", quality=quality)
            if buf.tell() <= max_bytes:
                return buf.getvalue()

    raise WebhookError(
        "Le PDF dépasse 5 Mo même après compression. Réduisez le nombre de "
        "pages ou la résolution du document."
    )


def _data_uri(image_bytes, image_base64, filename):
    """Build a `data:<mime>;base64,<data>` URI — the format LLM vision models
    accept directly in an image_url field."""
    if image_bytes is not None:
        mime = mimetypes.guess_type(filename)[0] or "image/jpeg"
        encoded = base64.b64encode(image_bytes).decode("ascii")
        return f"data:{mime};base64,{encoded}"
    # image_base64 may already be a full data URI or just the raw base64.
    s = str(image_base64 or "")
    return s if s.startswith("data:") else f"data:image/jpeg;base64,{s}"


def _bytes_from(image_bytes, image_base64):
    """Return raw image bytes from either source (decoding a base64/data URI)."""
    if image_bytes is not None:
        return image_bytes
    s = str(image_base64 or "")
    if s.startswith("data:"):
        s = s.split(",", 1)[-1]
    return base64.b64decode(s)


def _upload_public_url(image_bytes, filename):
    """Upload the image to Cloudinary and return a public URL the AI module can
    fetch (for a `file_input` / `file_url` parameter)."""
    try:
        import cloudinary.uploader
    except ImportError as exc:  # pragma: no cover
        raise WebhookError("Cloudinary n'est pas installé sur le serveur.") from exc
    if not os.getenv("CLOUDINARY_URL"):
        raise WebhookError(
            "CLOUDINARY_URL n'est pas configuré : impossible de générer une URL "
            "publique pour l'image."
        )
    try:
        res = cloudinary.uploader.upload(
            image_bytes, folder="scanner", resource_type="image"
        )
        return res["secure_url"]
    except Exception as exc:
        raise WebhookError(f"Échec de l'envoi de l'image vers Cloudinary: {exc}") from exc


def call_webhook(image_base64=None, image_bytes=None, filename="facture.jpg"):
    """Send the image to the configured AI webhook and return its JSON.

    WEBHOOK_IMAGE_MODE controls the wire format the scenario receives:
      - "url" (recommended): upload the image to Cloudinary and POST a public
        URL as JSON {"image_url", "file_url", "image", "filename"} — map any of
        these to the AI module's `file_input` / `file_url` parameter.
      - "base64": JSON {"image": "data:<mime>;base64,...", "filename": ...}.
      - "multipart": multipart/form-data with a binary `file` field.
    Switch via the env var to match how your Make/Integromat scenario reads it.
    """
    url = settings.WEBHOOK_URL
    if not url:
        raise WebhookError("WEBHOOK_URL n'est pas configuré sur le serveur.")
    mode = getattr(settings, "WEBHOOK_IMAGE_MODE", "multipart")
    try:
        if mode == "url":
            public_url = _upload_public_url(
                _bytes_from(image_bytes, image_base64), filename
            )
            resp = requests.post(
                url,
                json={
                    "image_url": public_url,
                    "file_url": public_url,
                    "image": public_url,
                    "filename": filename,
                },
                timeout=settings.WEBHOOK_TIMEOUT,
            )
        elif mode == "base64":
            resp = requests.post(
                url,
                json={
                    "image": _data_uri(image_bytes, image_base64, filename),
                    "filename": filename,
                },
                timeout=settings.WEBHOOK_TIMEOUT,
            )
        elif image_bytes is not None:
            resp = requests.post(
                url, files={"file": (filename, image_bytes)}, timeout=settings.WEBHOOK_TIMEOUT
            )
        else:
            resp = requests.post(url, json={"image": image_base64}, timeout=settings.WEBHOOK_TIMEOUT)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise WebhookError(f"Échec de l'appel au webhook IA: {exc}") from exc

    # The webhook MUST return the extraction JSON synchronously. Some platforms
    # (e.g. Make.com without a "Webhook Response" module) reply with a plain
    # acknowledgement like "Accepted" instead — detect that and explain.
    try:
        return resp.json()
    except ValueError:
        pass

    # LLM-backed webhooks often wrap JSON in ```json ... ``` fences or add
    # surrounding prose. Strip fences and isolate the JSON object before parsing.
    body = (resp.text or "").strip()
    parsed = _extract_json(body)
    if parsed is not None:
        return parsed
    raise WebhookError(
        "Le webhook a répondu sans JSON d'extraction exploitable "
        f"(réponse: {body[:120]!r}). Le scénario doit se terminer par un "
        "module « Webhook Response » renvoyant le JSON de la facture."
    )


def _extract_json(text):
    """Best-effort: parse JSON that may be wrapped in markdown fences/prose."""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(),
                     flags=re.IGNORECASE | re.MULTILINE).strip()
    for candidate in (cleaned, text):
        try:
            return json.loads(candidate)
        except (ValueError, TypeError):
            pass
    # Fallback: grab the outermost {...} block.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except (ValueError, TypeError):
            return None
    return None


def validate_extraction(data):
    """Validate AI payload. Returns list of error strings (empty = ok)."""
    errors = list(data.get("erreurs") or [])
    for field in REQUIRED_FIELDS:
        if field not in data:
            errors.append(f"Champ manquant: {field}")
    lignes = data.get("lignes") or []
    if not lignes:
        errors.append("Aucune ligne d'écriture fournie.")
    else:
        total_debit = sum(float(l.get("debit", 0)) for l in lignes)
        total_credit = sum(float(l.get("credit", 0)) for l in lignes)
        if abs(total_debit - total_credit) > 0.01:
            errors.append(
                f"Débit ({total_debit}) ≠ Crédit ({total_credit})."
            )
    return errors


def _parse_date(value):
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except (ValueError, TypeError):
            continue
    return datetime.today().date()


@transaction.atomic
def persist_extraction(entreprise, data, source="scanner"):
    """Create an Ecriture (+ lignes) in the right journal from AI data."""
    errors = validate_extraction(data)
    if errors:
        raise WebhookError("; ".join(errors))

    annee = (entreprise.exercices.filter(is_active=True).first()
             or entreprise.exercices.first())
    if annee is None:
        date_fact = _parse_date(data["date_facture"])
        annee = ExerciceAnnee.objects.create(
            entreprise=entreprise, annee=date_fact.year, is_active=True
        )

    type_journal = JOURNAL_MAP.get(str(data["journal"]).lower(), Journal.Type.ACHAT)
    journal, _ = Journal.objects.get_or_create(
        entreprise=entreprise, annee=annee, type_journal=type_journal
    )

    confiance = int(data.get("confiance", 0))
    statut = (Ecriture.Statut.VALIDE if confiance >= 90
              else Ecriture.Statut.EN_COURS)

    ecriture = Ecriture.objects.create(
        journal=journal,
        date_ecriture=_parse_date(data["date_facture"]),
        numero_piece=data.get("numero_facture", ""),
        fournisseur_client=data.get("fournisseur", ""),
        source=source,
        confiance_ia=confiance,
        statut=statut,
    )
    for ligne in data["lignes"]:
        LigneEcriture.objects.create(
            ecriture=ecriture,
            numero_compte=ligne.get("compte", ""),
            libelle=ligne.get("libelle", ""),
            montant_debit=ligne.get("debit", 0) or 0,
            montant_credit=ligne.get("credit", 0) or 0,
        )
    return ecriture
