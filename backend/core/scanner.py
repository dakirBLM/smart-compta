"""Scanner bridge: forwards an invoice image to the AI WEBHOOK_URL and
persists the confirmed extraction as an Ecriture + LigneEcriture set."""
import json
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


def call_webhook(image_base64=None, image_bytes=None, filename="facture.jpg"):
    """Send the image to the configured AI webhook and return its JSON."""
    url = settings.WEBHOOK_URL
    if not url:
        raise WebhookError("WEBHOOK_URL n'est pas configuré sur le serveur.")
    try:
        if image_bytes is not None:
            resp = requests.post(
                url, files={"file": (filename, image_bytes)}, timeout=120
            )
        else:
            resp = requests.post(url, json={"image": image_base64}, timeout=120)
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
