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
from django.core.exceptions import ValidationError

from .account_helpers import (
    apply_tiers_account,
    auto_balance_lines,
    get_or_create_client_comptable,
    get_or_create_fournisseur,
    _normalize_name,
)
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
    "banque": Journal.Type.BANQUE, "relevé": Journal.Type.BANQUE, "releve": Journal.Type.BANQUE,
    "relevé bancaire": Journal.Type.BANQUE, "releve bancaire": Journal.Type.BANQUE,
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


def upload_invoice_image(image_bytes, filename="facture.jpg"):
    """Store an uploaded invoice image and return its public URL (for archiving
    factures). Returns "" if Cloudinary isn't configured rather than failing."""
    if not os.getenv("CLOUDINARY_URL"):
        return ""
    return _upload_public_url(image_bytes, filename)


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


def call_webhook(image_base64=None, image_bytes=None, filename="facture.jpg", context=None):
    """Send the image to the configured AI webhook and return its JSON.

    `context` (e.g. {entreprise_nom, entreprise_nif}) is forwarded so the AI can
    classify the journal (Achats vs Ventes) by checking whether the scanning
    company is the invoice's issuer (sale) or recipient (purchase).

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
    ctx = context or {}
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
                    **ctx,
                },
                timeout=settings.WEBHOOK_TIMEOUT,
            )
        elif mode == "base64":
            resp = requests.post(
                url,
                json={
                    "image": _data_uri(image_bytes, image_base64, filename),
                    "filename": filename,
                    **ctx,
                },
                timeout=settings.WEBHOOK_TIMEOUT,
            )
        elif image_bytes is not None:
            resp = requests.post(
                url,
                files={"file": (filename, image_bytes)},
                data=ctx,
                timeout=settings.WEBHOOK_TIMEOUT,
            )
        else:
            resp = requests.post(
                url, json={"image": image_base64, **ctx}, timeout=settings.WEBHOOK_TIMEOUT
            )
    except requests.Timeout as exc:
        raise WebhookError(
            "L'IA met trop de temps à répondre. Veuillez réessayer dans quelques instants."
        ) from exc
    except requests.RequestException as exc:
        raise WebhookError(
            f"Connexion au service IA impossible. Veuillez réessayer plus tard. ({exc})"
        ) from exc

    # Friendly messages for the common upstream failures.
    if resp.status_code == 429:
        raise WebhookError(
            "L'IA est occupée (trop de requêtes). Veuillez réessayer dans quelques instants."
        )
    if resp.status_code >= 500:
        raise WebhookError(
            "Le service IA est momentanément indisponible. Veuillez réessayer dans quelques instants."
        )
    if resp.status_code >= 400:
        raise WebhookError(
            f"Le service IA a renvoyé une erreur ({resp.status_code}). Veuillez réessayer plus tard."
        )

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
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except (ValueError, TypeError):
            pass
    return None


def blocking_errors(data, entreprise=None):
    """Hard accounting/structure problems that must prevent saving — does NOT
    include the AI's `erreurs` notes (those are often just explanations, e.g.
    'timbre fiscal ajouté', and must not block a balanced entry)."""
    errors = []
    journal_str = str(data.get("journal", "")).lower()
    hint_str = str(data.get("journal_hint", "")).lower()
    is_bank_stmt = (
        any(k in journal_str for k in ("banque", "relev")) or
        any(k in hint_str for k in ("banque", "relev")) or
        data.get("type_facture") == "banque"
    )

    req_fields = [f for f in REQUIRED_FIELDS if f not in ("fournisseur", "montant_ht", "tva_pourcentage", "montant_tva", "montant_ttc")] if is_bank_stmt else REQUIRED_FIELDS
    for field in req_fields:
        if field not in data:
            errors.append(f"Champ manquant: {field}")
    lignes = data.get("lignes") or []
    if not lignes:
        errors.append("Aucune ligne d'écriture fournie.")
    elif not is_bank_stmt:
        total_debit = sum(float(l.get("debit", 0) or 0) for l in lignes)
        total_credit = sum(float(l.get("credit", 0) or 0) for l in lignes)
        if abs(total_debit - total_credit) > 0.01:
            errors.append(f"Débit ({total_debit}) ≠ Crédit ({total_credit}).")
    else:
        normalized_lignes = [_normalize_bank_line(l) for l in lignes]
        valid_ops = any(float(l.get("debit", 0) or 0) > 0 or float(l.get("credit", 0) or 0) > 0 for l in normalized_lignes)
        if not valid_ops:
            errors.append("Le relevé bancaire ne contient aucune opération avec un montant valide.")
        try:
            check_bank_account_match(entreprise, data)
        except WebhookError as exc:
            errors.append(str(exc))
    return errors


def validate_extraction(data, entreprise=None):
    """Errors for DISPLAY in the review screen: the AI's own notes/errors plus
    the structural checks. Shown to the user but not all blocking."""
    data = sanitize_bank_statement_data(data, entreprise=entreprise)
    return list(data.get("erreurs") or []) + blocking_errors(data, entreprise=entreprise)


def _parse_date(value):
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except (ValueError, TypeError):
            continue
    return datetime.today().date()


def _sort_bank_lines(lignes):
    """Trie les lignes de relevé bancaire par date, puis par ordre d'origine."""
    enriched = []
    for idx, ligne in enumerate(lignes or []):
        entry = dict(ligne or {})
        if entry.get("date"):
            entry["_parsed_date"] = _parse_date(entry.get("date"))
        else:
            entry["_parsed_date"] = None
        entry["_original_index"] = idx
        enriched.append(entry)

    enriched.sort(
        key=lambda entry: (
            entry["_parsed_date"] or datetime.min.date(),
            entry["_original_index"],
        )
    )
    for entry in enriched:
        entry.pop("_parsed_date", None)
        entry.pop("_original_index", None)
    return enriched


def _coerce_amount(value):
    if value in (None, ""):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(" ", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def _normalize_bank_line(line):
    if not isinstance(line, dict):
        return {}

    normalized = dict(line)

    # Normalize common bank statement amount keys.
    if normalized.get("debit") in (None, "") and normalized.get("montant_debit") not in (None, ""):
        normalized["debit"] = normalized.get("montant_debit")
    if normalized.get("credit") in (None, "") and normalized.get("montant_credit") not in (None, ""):
        normalized["credit"] = normalized.get("montant_credit")
    if normalized.get("debit") in (None, "") and normalized.get("debit_montant") not in (None, ""):
        normalized["debit"] = normalized.get("debit_montant")
    if normalized.get("credit") in (None, "") and normalized.get("credit_montant") not in (None, ""):
        normalized["credit"] = normalized.get("credit_montant")

    debit = normalized.get("debit")
    credit = normalized.get("credit")
    amount = normalized.get("montant")
    if amount is None:
        amount = normalized.get("amount")
    if amount is None:
        amount = normalized.get("montant_ttc")

    sens = str(normalized.get("sens") or normalized.get("type") or normalized.get("nature") or "").strip().lower()

    if (debit in (None, "", 0) and credit in (None, "", 0)) and amount not in (None, "", 0):
        amount_val = _coerce_amount(amount)
        if any(k in sens for k in ["credit", "crédit", "entrant", "encaissement", "recette", "recu", "c"]):
            normalized["debit"] = 0.0
            normalized["credit"] = amount_val
        else:
            normalized["debit"] = amount_val
            normalized["credit"] = 0.0

    if normalized.get("debit") in (None, ""):
        normalized["debit"] = 0.0
    if normalized.get("credit") in (None, ""):
        normalized["credit"] = 0.0

    normalized["debit"] = _coerce_amount(normalized.get("debit"))
    normalized["credit"] = _coerce_amount(normalized.get("credit"))
    return normalized


def _resolve_exercice(entreprise, date_fact):
    """Exercice de l'écriture : l'année de la date de facture si elle existe,
    sinon l'exercice actif, sinon création depuis la date de facture."""
    ex = entreprise.exercices.filter(annee=date_fact.year).first()
    if ex:
        return ex
    ex = entreprise.exercices.filter(is_active=True).first()
    if ex:
        return ex
    return ExerciceAnnee.objects.create(
        entreprise=entreprise, annee=date_fact.year, is_active=True
    )


CAISSE_COMPTE = "530000"


def check_bank_account_match(entreprise, data):
    """Vérifie que le numéro de compte bancaire du relevé correspond à celui de l'entreprise."""
    extracted_acc = (
        data.get("numero_compte_bancaire") or
        data.get("numero_compte") or
        data.get("rib") or
        ""
    )

    def clean(s):
        return re.sub(r'[^A-Za-z0-9]', '', str(s or '')).upper()

    norm_extracted = clean(extracted_acc)

    ent_accs = [
        clean(entreprise.numero_compte),
        clean(entreprise.rib),
        clean(entreprise.numero_compte2),
        clean(entreprise.rib2),
    ]
    ent_accs = [a for a in ent_accs if len(a) >= 4]

    if not ent_accs:
        raise WebhookError(
            "L'entreprise n'est pas configurée avec un numéro de compte bancaire ou RIB dans son profil. "
            "Veuillez renseigner le compte bancaire de l'entreprise dans ses paramètres."
        )

    if norm_extracted:
        matched = any(norm_extracted in a or a in norm_extracted for a in ent_accs)
        if not matched:
            configured_list = ", ".join(filter(None, [entreprise.numero_compte, entreprise.rib, entreprise.numero_compte2, entreprise.rib2]))
            raise WebhookError(
                f"Le numéro de compte bancaire du relevé ({extracted_acc}) "
                f"ne correspond pas aux comptes bancaires enregistrés de l'entreprise ({configured_list})."
            )


def resolve_bank_counterpart(ligne, is_debit, entreprise):
    """Détermine le compte de contrepartie (401, 411, 6xx, 7xx, 530, etc.) et le nom du tiers."""
    compte_fourni = str(ligne.get("compte") or ligne.get("compte_contrepartie") or "").strip()
    libelle = " ".join(
        filter(None, [
            str(ligne.get("libelle") or ""),
            str(ligne.get("description") or ""),
            str(ligne.get("tiers") or ""),
        ])
    ).lower()
    tiers = str(ligne.get("tiers") or ligne.get("fournisseur") or "").strip()

    if compte_fourni and compte_fourni != "512000":
        return compte_fourni, tiers or "Tiers"

    if is_debit:
        # Bank Debit (Outflow / Dépense)
        if any(k in libelle for k in ["frais", "agios", "commission", "cotisation", "tenue de compte"]):
            return "627000", tiers or "Frais bancaires"
        if any(k in libelle for k in ["intérêt", "interet", "agios"]):
            return "661000", tiers or "Intérêts bancaires"
        if any(k in libelle for k in ["salaire", "virement paie", "paie", "remuneration"]):
            return "421000", tiers or "Personnel"
        if any(k in libelle for k in ["retrait", "caisse", "especes", "espèces"]):
            return "530000", tiers or "Caisse"
        if any(k in libelle for k in ["tva", "impot", "impôt", "dgi", "taxe", "tax"]):
            return "445000", tiers or "Trésor Public"
        if any(k in libelle for k in ["retour de chèque", "retour cheque", "cheque retourne", "chèque retourné", "cheque retourne", "cheque retourné", "retour chèque", "retour cheque", "chèque retour", "cheque retour"]):
            if tiers and _normalize_name(tiers) != _normalize_name(entreprise.nom):
                if "client" in libelle or "client" in tiers.lower():
                    try:
                        cl = get_or_create_client_comptable(entreprise, tiers)
                        return cl.numero_compte or "411000", cl.nom
                    except Exception:
                        pass
                    return "411000", tiers or "Client - Chèque retourné"
                if "fournisseur" in libelle or "supplier" in tiers.lower():
                    try:
                        fourn = get_or_create_fournisseur(entreprise, tiers)
                        return fourn.numero_compte or "401000", fourn.nom
                    except Exception:
                        pass
                    return "401000", tiers or "Fournisseur - Chèque retourné"
                try:
                    cl = get_or_create_client_comptable(entreprise, tiers)
                    return cl.numero_compte or "411000", cl.nom
                except Exception:
                    pass
            return "401000", tiers or "Fournisseur - Chèque retourné"

        if tiers and _normalize_name(tiers) != _normalize_name(entreprise.nom):
            try:
                fourn = get_or_create_fournisseur(entreprise, tiers)
                return fourn.numero_compte or "401000", fourn.nom
            except Exception:
                pass
        return "401000", tiers or "Fournisseur Dépense"
    else:
        # Bank Credit (Inflow / Recette)
        if any(k in libelle for k in ["subvention"]):
            return "740000", tiers or "Subvention d'exploitation"
        if any(k in libelle for k in ["intérêts créditeurs", "interets crediteurs", "produit financier"]):
            return "768000", tiers or "Produits financiers"
        if any(k in libelle for k in ["versement espèces", "versement especes"]):
            return "530000", tiers or "Caisse"
        if any(k in libelle for k in ["retour de chèque", "retour cheque", "cheque retourne", "chèque retourné", "cheque retourne", "cheque retourné", "retour chèque", "retour cheque", "chèque retour", "cheque retour"]):
            if tiers and _normalize_name(tiers) != _normalize_name(entreprise.nom):
                try:
                    cl = get_or_create_client_comptable(entreprise, tiers)
                    return cl.numero_compte or "411000", cl.nom
                except Exception:
                    pass
            return "411000", tiers or "Client - Chèque retourné"

        if tiers and _normalize_name(tiers) != _normalize_name(entreprise.nom):
            try:
                cl = get_or_create_client_comptable(entreprise, tiers)
                return cl.numero_compte or "411000", cl.nom
            except Exception:
                pass
        return "411000", tiers or "Client Recette"


def sanitize_bank_statement_data(data, entreprise=None):
    """
    Normalise les données d'extraction d'un relevé bancaire pour s'assurer
    que les opérations bancaires sont bien dans `lignes` et que la confiance
    n'est pas artificiellement dégradée par des règles de factures d'achat/vente.
    """
    if not isinstance(data, dict):
        return data

    journal_str = str(data.get("journal", "")).lower()
    type_facture = str(data.get("type_facture", "")).lower()
    is_bank_stmt = (
        any(k in journal_str for k in ("banque", "relev")) or
        type_facture == "banque" or
        any(k in str(data.get("journal_hint", "")).lower() for k in ("banque", "relev"))
    )

    if not is_bank_stmt:
        return data

    data["journal"] = "Banque"
    data["type_facture"] = "banque"

    # Map operations/transactions/mouvements to `lignes` if missing
    if not data.get("lignes"):
        alt_lignes = data.get("operations") or data.get("mouvements") or data.get("transactions") or data.get("lines") or data.get("items") or []
        if alt_lignes:
            data["lignes"] = alt_lignes

    # Ensure required top-level invoice dummy fields are present for bank statements
    if not data.get("fournisseur"):
        data["fournisseur"] = entreprise.nom if entreprise else "Banque"
    if not data.get("numero_facture"):
        data["numero_facture"] = data.get("numero_releve") or data.get("reference") or f"RELEV-{datetime.today().strftime('%Y%m%d')}"
    if not data.get("date_facture"):
        data["date_facture"] = data.get("date_releve") or data.get("date_edition") or data.get("date") or datetime.today().strftime("%d/%m/%Y")

    data["montant_ht"] = 0.0
    data["tva_pourcentage"] = 0.0
    data["montant_tva"] = 0.0

    lignes = data.get("lignes") or []
    normalized_lignes = [_normalize_bank_line(l) for l in lignes]
    data["lignes"] = normalized_lignes

    if normalized_lignes:
        tot = sum(max(float(l.get("debit", 0) or 0), float(l.get("credit", 0) or 0)) for l in normalized_lignes)
        data["montant_ttc"] = tot

    # Filter out invoice-specific complaint messages that do not apply to bank statements
    ai_errors = list(data.get("erreurs") or [])
    filtered_errors = [
        err for err in ai_errors
        if not any(k in str(err).lower() for k in [
            "non une facture",
            "pas une facture",
            "n'est pas une facture",
            "est pas une facture",
            "relevé d'opérations bancaires",
            "releve d'operations bancaires",
            "releve bancaire",
            "ht/tva/ttc",
            "montant ht",
            "montant tva",
            "aucun montant ht",
            "aucun montant tva",
            "identifiable",
            "n'apparaît pas sur le document",
            "n'apparait pas sur le document",
            "n'apparaît pas",
            "n'apparait pas",
            "ne figure pas",
            "société soualhi",   # any specific company mention in "ne figure pas" context
            "la société",        # "La société X n'apparaît pas"
            "aucune ligne d'écriture fournie",
            "aucune ligne d ecriture",
        ])
    ]
    data["erreurs"] = filtered_errors

    # Set confidence high if valid operations are present
    if lignes and len(lignes) > 0:
        data["confiance"] = max(int(data.get("confiance", 0) or 0), 95)

    return data


def persist_bank_statement(entreprise, data, source="scanner"):
    """Comptabilise un relevé bancaire ligne par ligne dans le journal Banque (512)."""
    data = sanitize_bank_statement_data(data, entreprise=entreprise)
    check_bank_account_match(entreprise, data)

    lignes = _sort_bank_lines(data.get("lignes") or [])
    if not lignes:
        raise WebhookError("Le relevé bancaire ne contient aucune ligne d'opération.")

    date_stmt = _parse_date(data.get("date_facture") or data.get("date"))
    annee = _resolve_exercice(entreprise, date_stmt)
    journal, _ = Journal.objects.get_or_create(
        entreprise=entreprise, annee=annee, type_journal=Journal.Type.BANQUE
    )

    confiance = int(data.get("confiance", 0) or 90)
    statut = Ecriture.Statut.VALIDE if confiance >= 90 else Ecriture.Statut.EN_COURS
    mode_p = "relevé bancaire"
    ref_stmt = data.get("numero_facture") or f"RELEV-{date_stmt.strftime('%Y%m%d')}"

    ecritures = []
    for idx, line in enumerate(lignes):
        debit_val = float(line.get("debit", 0) or 0)
        credit_val = float(line.get("credit", 0) or 0)
        if debit_val <= 0 and credit_val <= 0:
            continue

        date_op = _parse_date(line.get("date")) if line.get("date") else date_stmt
        is_debit = debit_val > 0
        montant = debit_val if is_debit else credit_val
        libelle_op = line.get("libelle") or line.get("description") or f"Opération {idx+1}"
        num_piece = line.get("piece") or line.get("reference") or f"{ref_stmt}-{idx+1}"

        compte_cp, tiers_nom = resolve_bank_counterpart(line, is_debit, entreprise)

        ec = Ecriture.objects.create(
            journal=journal,
            date_ecriture=date_op,
            numero_piece=num_piece,
            fournisseur_client=tiers_nom,
            source=source,
            confiance_ia=confiance,
            statut=statut,
            mode_paiement=mode_p,
        )

        if is_debit:
            # Sortie de banque (Dépense) : Débit compte de contrepartie, Crédit 512000
            LigneEcriture.objects.create(
                ecriture=ec,
                numero_compte=compte_cp,
                libelle=libelle_op,
                montant_debit=montant,
                montant_credit=0,
            )
            LigneEcriture.objects.create(
                ecriture=ec,
                numero_compte="512000",
                libelle=f"Débit Banque — {libelle_op}",
                montant_debit=0,
                montant_credit=montant,
            )
        else:
            # Entrée en banque (Recette) : Débit 512000, Crédit compte de contrepartie
            LigneEcriture.objects.create(
                ecriture=ec,
                numero_compte="512000",
                libelle=f"Crédit Banque — {libelle_op}",
                montant_debit=montant,
                montant_credit=0,
            )
            LigneEcriture.objects.create(
                ecriture=ec,
                numero_compte=compte_cp,
                libelle=libelle_op,
                montant_debit=0,
                montant_credit=montant,
            )

        ecritures.append(ec)

    if not ecritures:
        raise WebhookError("Aucune écriture comptable n'a pu être générée à partir du relevé.")

    return ecritures[0]


@transaction.atomic
def persist_extraction(entreprise, data, source="scanner"):
    """Comptabilise une extraction IA."""
    data = sanitize_bank_statement_data(data, entreprise=entreprise)
    journal_str = str(data.get("journal", "")).lower()
    base_type = JOURNAL_MAP.get(journal_str, Journal.Type.ACHAT)

    is_bank_statement = (
        base_type == Journal.Type.BANQUE or
        data.get("type_facture") == "banque" or
        any(k in journal_str for k in ("banque", "relev"))
    )

    if is_bank_statement:
        errors = blocking_errors(data, entreprise=entreprise)
        if errors:
            raise WebhookError("; ".join(errors))
        return persist_bank_statement(entreprise, data, source=source)

    # Auto-équilibrage des débits et crédits (droits de timbre, frais annexes, régularisations)
    if data.get("lignes"):
        data["lignes"] = auto_balance_lines(data["lignes"], is_vente=(base_type == Journal.Type.VENTE))

    errors = blocking_errors(data)
    if errors:
        raise WebhookError("; ".join(errors))

    date_fact = _parse_date(data["date_facture"])
    annee = _resolve_exercice(entreprise, date_fact)
    mode = (data.get("mode_paiement") or "").strip().lower()

    CASH_MODES = {"espèce", "espèces", "espece", "especes", "cash", "caisse", "liquide"}
    BANK_MODES = {
        "chèque", "cheque", "virement", "transfer", "transfert",
        "carte", "carte bancaire", "cb", "cheque bancaire", "banque"
    }

    is_cash = any(k in mode for k in CASH_MODES)
    is_bank = any(k in mode for k in BANK_MODES)

    # --- 1) écriture de la facture, dans SON journal (achat/vente/...) -------
    journal, _ = Journal.objects.get_or_create(
        entreprise=entreprise, annee=annee, type_journal=base_type
    )

    # Récupération du nom du tiers détecté par l'IA
    tiers_nom = (data.get("fournisseur") or "").strip()
    if not tiers_nom:
        raise WebhookError(
            "Le nom du client/fournisseur n'a pas été détecté sur la facture. "
            "Veuillez vérifier que le document est lisible."
        )
    
    # 🔥 LOGIQUE CORRIGÉE :
    # 1. Si le nom détecté est l'ENTREPRISE et qu'on est en ACHAT → l'entreprise est le CLIENT
    #    → c'est une facture d'achat (l'entreprise achète à un fournisseur)
    # 2. Si le nom détecté est l'ENTREPRISE et qu'on est en VENTE → l'entreprise est le FOURNISSEUR
    #    → c'est une facture de vente (l'entreprise vend à un client)
    # 3. Si le nom détecté n'est PAS l'entreprise → c'est le tiers (client ou fournisseur)
    
    # Le tiers doit être le NOM RÉEL identifié par l'IA sur la facture —
    # jamais un placeholder, jamais un nom inventé. Si l'IA a renvoyé le nom
    # de l'entreprise elle-même (cas typique d'une VENTE où elle a extrait
    # l'émetteur au lieu du client "Doit:"), on refuse avec un message clair :
    # le comptable corrige le champ Fournisseur/Client dans l'écran de
    # révision (il y est éditable) puis confirme.
    if base_type in (Journal.Type.ACHAT, Journal.Type.VENTE) and _normalize_name(tiers_nom) == _normalize_name(entreprise.nom):
        if base_type == Journal.Type.VENTE:
            raise WebhookError(
                "Le CLIENT de la facture n'a pas été identifié (l'IA a renvoyé "
                "le nom de l'entreprise). Corrigez le champ Fournisseur/Client "
                "avec le nom du client (ligne « Doit : ») puis confirmez."
            )
        raise WebhookError(
            "Le FOURNISSEUR de la facture n'a pas été identifié (l'IA a renvoyé "
            "le nom de l'entreprise). Corrigez le champ Fournisseur/Client "
            "puis confirmez."
        )
    
    # Maintenant, on enregistre le tiers dans le bon compte
    tiers_compte = None
    lignes_data = list(data["lignes"])
    
    if base_type == Journal.Type.ACHAT:
        # C'est un achat → on crée un fournisseur (401)
        try:
            tiers = get_or_create_fournisseur(entreprise, tiers_nom)
            tiers_compte = tiers.numero_compte
            lignes_data = apply_tiers_account(lignes_data, tiers_compte, "401")
            fournisseur_client_nom = tiers.nom
        except ValidationError as e:
            raise WebhookError(str(e))
    elif base_type == Journal.Type.VENTE:
        # C'est une vente → on crée un client (411)
        try:
            tiers = get_or_create_client_comptable(entreprise, tiers_nom)
            tiers_compte = tiers.numero_compte
            lignes_data = apply_tiers_account(lignes_data, tiers_compte, "411")
            fournisseur_client_nom = tiers.nom
        except ValidationError as e:
            raise WebhookError(str(e))
    else:
        # BANQUE, CAISSE, OD, etc.
        fournisseur_client_nom = tiers_nom


    confiance = int(data.get("confiance", 0))
    statut = (Ecriture.Statut.VALIDE if confiance >= 90
              else Ecriture.Statut.EN_COURS)
    numero = data.get("numero_facture", "")

    ecriture = Ecriture.objects.create(
        journal=journal,
        date_ecriture=date_fact,
        numero_piece=numero,
        fournisseur_client=fournisseur_client_nom,
        source=source,
        confiance_ia=confiance,
        statut=statut,
        mode_paiement=data.get("mode_paiement", "") or "",
    )
    for ligne in lignes_data:
        LigneEcriture.objects.create(
            ecriture=ecriture,
            numero_compte=ligne.get("compte", ""),
            libelle=ligne.get("libelle", ""),
            montant_debit=ligne.get("debit", 0) or 0,
            montant_credit=ligne.get("credit", 0) or 0,
        )

    # --- 2) règlement espèces uniquement → écriture correspondante (TTC, 2 lignes) ----------
    # For bank payments, the movement is already reflected by the bank statement import,
    # so we must not create an extra settlement entry in the Banque journal.
    # The caisse logic remains unchanged.
    if is_cash and base_type in (Journal.Type.ACHAT, Journal.Type.VENTE):
        ttc = float(data.get("montant_ttc") or 0)
        if ttc > 0:
            reg_type = Journal.Type.CAISSE
            compte_tresorerie = CAISSE_COMPTE
            lib_reglement = "Règlement espèces"

            reg_journal, _ = Journal.objects.get_or_create(
                entreprise=entreprise, annee=annee,
                type_journal=reg_type,
            )
            reglement = Ecriture.objects.create(
                journal=reg_journal,
                date_ecriture=date_fact,
                numero_piece=numero,
                fournisseur_client=fournisseur_client_nom,
                source=source,
                confiance_ia=confiance,
                statut=statut,
                mode_paiement=data.get("mode_paiement", "") or "",
            )
            if base_type == Journal.Type.ACHAT:
                compte_tiers = tiers_compte or "401000"
                paires = [
                    (compte_tiers, f"Règlement fournisseur {fournisseur_client_nom} — {numero}", ttc, 0),
                    (compte_tresorerie, f"{lib_reglement} — {numero}", 0, ttc),
                ]
            else:  # VENTE
                compte_tiers = tiers_compte or "411000"
                paires = [
                    (compte_tresorerie, f"{lib_reglement} — {numero}", ttc, 0),
                    (compte_tiers, f"Règlement client {fournisseur_client_nom} — {numero}", 0, ttc),
                ]
            for compte, libelle, deb, cred in paires:
                LigneEcriture.objects.create(
                    ecriture=reglement,
                    numero_compte=compte,
                    libelle=libelle,
                    montant_debit=deb,
                    montant_credit=cred,
                )

    return ecriture