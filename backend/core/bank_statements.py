"""Validation and posting of AI-extracted bank statements.

The AI is deliberately responsible only for reading/classifying a statement.
This module remains the accounting authority: it validates the statement bank
account and builds both sides of every entry itself.
"""
from datetime import datetime
from decimal import Decimal, InvalidOperation
import re
import unicodedata

from django.core.exceptions import ValidationError
from django.db import transaction

from .account_helpers import (
    apply_scf_subaccounts,
    enterprise_bank_subaccount,
    get_or_create_client_comptable,
    get_or_create_fournisseur,
)
from .models import Ecriture, ExerciceAnnee, Journal, LigneEcriture, SCFAccount


BANK_ACCOUNT = "512000"


def enterprise_bank_account(entreprise, label=""):
    """Return the named dynamic SCF account for the enterprise's bank."""
    if not entreprise or not (entreprise.banque or entreprise.banque2):
        return BANK_ACCOUNT
    if not SCFAccount.objects.filter(
        entreprise__isnull=True, numero_compte="512"
    ).exists():
        normalized_label = _normalize_label(label)
        if entreprise.banque2 and entreprise.banque2.upper() in normalized_label:
            return "512002"
        return "512001"
    return enterprise_bank_subaccount(entreprise, label)

# Compte d'attente used when the AI cannot determine the counterpart account.
# The accountant can correct it in the journal afterwards.
HOLDING_ACCOUNT = "471000"


# ──────────────────────────────────────────────────────────────────────────────
# Mots-clés pour la classification des opérations bancaires
# ──────────────────────────────────────────────────────────────────────────────

_KW_VERSEMENT = ("VERSEMENT",)

_KW_CHQ_RETOUR = ("CHQ RETOUR", "CHEQUE RETOUR", "CHQ NOS CLT", "CH NOS CLT")

_KW_SORT_CHQ = ("SORT CHQ", "SORTIE CHQ")

_KW_FOURNISSEUR = (
    "CHQ FOUR", "CHEQUE FOUR",
    "VIR FOUR", "VIREMENT FOUR", "PAIEMENT FOUR", "PAI FOUR",
    "REG FOUR", "REGLEMENT FOUR", "OV FOUR",
    "VIR FOURNISSEUR", "PAIEMENT FOURNISSEUR", "REGLEMENT FOURNISSEUR",
)

_KW_CLIENT = (
    "REMISE CHQ", "REM CHQ", "REMISE CHEQUE",
    "ENCAISSEMENT", "REGLEMENT CLIENT", "REG CLIENT",
    "VIR CLIENT", "VIREMENT CLIENT",
)

_KW_FRAIS = (
    "FRAIS", "COMMISSION", "AGIOS",
    "TENUE DE COMPTE", "TENUE COMPTE", "FRAIS DE TENUE",
    "COTISATION CB", "COTISATION CARTE",
    "FRAIS BANCAIRES", "INTERETS DEBITEURS",
)


def _normalize_label(label):
    """Normalise un libellé pour la comparaison : majuscules + suppression des accents."""
    nfkd = unicodedata.normalize("NFKD", str(label or ""))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).upper()


def _label_contains_any(label_norm, keywords):
    """Retourne True si le libellé normalisé contient l'un des mots-clés."""
    return any(kw in label_norm for kw in keywords)


class BankStatementError(Exception):
    """A statement cannot be safely imported."""


def normalize_bank_account(value):
    """Compare account numbers independently from spaces, dashes and dots."""
    return re.sub(r"[^0-9A-Za-z]", "", str(value or "")).upper()


def entreprise_bank_accounts(entreprise):
    return {
        account
        for account in (
            normalize_bank_account(entreprise.numero_compte),
            normalize_bank_account(entreprise.numero_compte2),
        )
        if account
    }


def validate_statement_account(entreprise, statement_account):
    expected = entreprise_bank_accounts(entreprise)
    received = normalize_bank_account(statement_account)
    if not expected:
        raise BankStatementError(
            "Aucun numéro de compte bancaire n'est enregistré pour cette entreprise."
        )
    if not received:
        raise BankStatementError("Le numéro de compte est absent du relevé bancaire.")
    if received not in expected:
        raise BankStatementError(
            "Le numéro de compte du relevé ne correspond pas au compte bancaire "
            "enregistré pour cette entreprise. Import rejeté."
        )


def _value(row, *names):
    for name in names:
        if row.get(name) not in (None, ""):
            return row[name]
    return None


def _decimal(value, field):
    if isinstance(value, str):
        # Handles French exports such as "866 041,72 DZD".
        value = value.replace(" ", "").replace("\u00a0", "")
        if "," in value:
            # In French notation a dot is a thousands separator when a comma
            # is present (e.g. 866.041,72).
            value = value.replace(".", "").replace(",", ".")
        value = re.sub(r"[^0-9.\-]", "", value)
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise BankStatementError(f"Montant invalide pour la ligne « {field} ».")
    if amount <= 0:
        raise BankStatementError("Chaque montant du relevé doit être strictly positif.")
    return amount


def _date(value):
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(str(value), fmt).date()
        except (ValueError, TypeError):
            continue
    raise BankStatementError(f"Date de relevé invalide : {value!r}.")


def _direction(row):
    raw = str(_value(row, "sens", "direction", "mouvement") or "").strip().lower()
    normalized = raw.replace("é", "e")
    if normalized in {"debit", "d", "debit bancaire"}:
        return "debit"
    if normalized in {"credit", "c", "credit bancaire"}:
        return "credit"

    debit = _value(row, "debit", "montant_debit")
    credit = _value(row, "credit", "montant_credit")
    # Exports often contain two amount columns; exactly one must be filled.
    def nonzero(v):
        if v in (None, "", 0, "0", "0.00", "0,00"):
            return False
        try:
            return _decimal(v, "débit/crédit") > 0
        except BankStatementError:
            return False

    if nonzero(debit) and not nonzero(credit):
        return "debit"
    if nonzero(credit) and not nonzero(debit):
        return "credit"
    raise BankStatementError(
        "Le sens de chaque ligne doit être « debit » ou « credit » "
        "(ou une seule colonne débit/crédit renseignée)."
    )


def _amount(row):
    direct = _value(row, "montant", "amount")
    if direct is not None:
        return _decimal(direct, "montant")
    direction = _direction(row)
    return _decimal(
        _value(row, "debit", "montant_debit") if direction == "debit"
        else _value(row, "credit", "montant_credit"),
        "débit" if direction == "debit" else "crédit",
    )


def _raw_counterpart(row):
    """Extrait le compte de contrepartie brut fourni par l'IA (chiffres uniquement).

    Retourne une chaîne vide si le compte est absent, invalide ou égal au
    compte bancaire.  La classification complète est effectuée par
    classify_operation().
    """
    account = str(_value(row, "compte_contrepartie", "compte", "counterpart_account") or "").strip()
    account = re.split(r"\s", account)[0]
    if re.fullmatch(r"\d{3,20}", account) and account != BANK_ACCOUNT:
        return account
    return ""


def classify_operation(label, direction, raw_counterpart, tiers="", entreprise=None):
    """Détermine (compte_debit, compte_credit) à partir de la nature de l'opération.

    Règles de priorité (ordre décroissant) :

    1.  Libellé contient VERSEMENT           → (512000, 581000)
    2.  Libellé contient CHQ RETOUR          → (401xxx, 512000)
    3.  Libellé contient mot-clé fournisseur → (401xxx, 512000)
    4.  Libellé contient mot-clé client      → (512000, 411xxx)
    5.  Libellé contient mot-clé frais       → (627000, 512000)
    6.  Contrepartie IA commence par 401     → (401xxx, 512000)
    7.  Contrepartie IA commence par 411     → (512000, 411xxx)
    8.  Contrepartie IA valide + sortie      → (contrepartie, 512000)
    9.  Contrepartie IA valide + entrée      → (512000, contrepartie)
    10. Tiers renseigné + sortie bancaire    → (401xxx, 512000)  [heuristique]
    11. Tiers renseigné + entrée bancaire    → (512000, 411xxx)  [heuristique]
    12. Fallback par direction               → (HOLDING, 512000) ou (512000, HOLDING)

    ``direction == "credit"`` signifie que le compte bancaire est crédité (sortie).
    ``direction == "debit"``  signifie que le compte bancaire est débité (entrée).
    """
    lib = _normalize_label(label)
    raw = (raw_counterpart or "").strip()
    tiers = (tiers or "").strip()

    def resolve_fourn(fallback="401000"):
        """Retourne le sous-compte fournisseur 401xxx."""
        if entreprise and tiers:
            try:
                return get_or_create_fournisseur(entreprise, tiers).numero_compte
            except ValidationError:
                pass
        if re.fullmatch(r"401\d+", raw):
            return raw
        return fallback

    def resolve_client(fallback="411000"):
        """Retourne le sous-compte client 411xxx."""
        if entreprise and tiers:
            try:
                return get_or_create_client_comptable(entreprise, tiers).numero_compte
            except ValidationError:
                pass
        if re.fullmatch(r"411\d+", raw):
            return raw
        return fallback

    # Règle 1 – Versement d'espèces en banque
    if _label_contains_any(lib, _KW_VERSEMENT):
        return (BANK_ACCOUNT, "581000")

    # Règle 2 – Chèque retour
    if _label_contains_any(lib, _KW_CHQ_RETOUR):
        return (resolve_fourn("401000"), BANK_ACCOUNT)

    # Règle SORT CHQ / SORTIE CHQ : analyse contextuelle (ne JAMAIS imposer 401000 automatiquement)
    if _label_contains_any(lib, _KW_SORT_CHQ):
        # 1. Frais bancaires ?
        if _label_contains_any(lib, _KW_FRAIS) or raw.startswith("6"):
            return ("627000", BANK_ACCOUNT)
        # 2. Opération client ?
        if _label_contains_any(lib, _KW_CLIENT) or raw.startswith("411") or direction == "debit":
            return (BANK_ACCOUNT, resolve_client())
        # 3. Opération fournisseur explicite ?
        if _label_contains_any(lib, _KW_FOURNISSEUR) or raw.startswith("401") or tiers:
            return (resolve_fourn(), BANK_ACCOUNT)
        # 4. Compte de contrepartie IA spécifique
        if re.fullmatch(r"\d{3,20}", raw) and raw != BANK_ACCOUNT:
            if direction == "credit":
                return (raw, BANK_ACCOUNT)
            return (BANK_ACCOUNT, raw)
        # 5. Par défaut : pas d'attribution 401000 automatique -> compte d'attente
        if direction == "credit":
            return (HOLDING_ACCOUNT, BANK_ACCOUNT)
        return (BANK_ACCOUNT, HOLDING_ACCOUNT)

    # Règle 3 – Paiement fournisseur (sortie bancaire)
    if _label_contains_any(lib, _KW_FOURNISSEUR):
        return (resolve_fourn(), BANK_ACCOUNT)

    # Règle 4 – Encaissement / règlement client (entrée bancaire)
    if _label_contains_any(lib, _KW_CLIENT):
        return (BANK_ACCOUNT, resolve_client())

    # Règle 5 – Frais bancaires (sortie bancaire)
    if _label_contains_any(lib, _KW_FRAIS):
        return ("627000", BANK_ACCOUNT)

    # Règles 6–9 – Contrepartie fournie par l'IA
    if re.fullmatch(r"\d{3,20}", raw) and raw != BANK_ACCOUNT:
        if raw.startswith("401"):
            return (resolve_fourn(raw), BANK_ACCOUNT)
        if raw.startswith("411"):
            return (BANK_ACCOUNT, resolve_client(raw))
        # Autre compte valide : sens déterminé par la direction
        if direction == "credit":   # sortie bancaire
            return (raw, BANK_ACCOUNT)
        return (BANK_ACCOUNT, raw)  # entrée bancaire

    # Règles 10–11 – Tiers renseigné sans mot-clé : heuristique par direction
    if tiers:
        if direction == "credit":   # sortie → probablement fournisseur
            return (resolve_fourn(), BANK_ACCOUNT)
        return (BANK_ACCOUNT, resolve_client())  # entrée → probablement client

    # Règle 12 – Fallback compte d'attente
    if direction == "credit":
        return (HOLDING_ACCOUNT, BANK_ACCOUNT)
    return (BANK_ACCOUNT, HOLDING_ACCOUNT)


def validated_lines(data):
    """Normalize the AI payload before any database mutation occurs."""
    rows = data.get("lignes") or data.get("transactions") or []
    if not isinstance(rows, list) or not rows:
        raise BankStatementError("Le relevé ne contient aucune ligne à importer.")

    result = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise BankStatementError(f"La ligne {index} du relevé est invalide.")
        label = str(_value(row, "libelle", "label", "description") or "").strip()
        if not label:
            raise BankStatementError(f"Le libellé de la ligne {index} est absent.")
        result.append({
            "date": _date(_value(row, "date", "date_operation", "date_ecriture")),
            "libelle": label[:255],
            "reference": str(_value(row, "reference", "numero_piece", "id") or "").strip()[:60],
            "direction": _direction(row),
            "amount": _amount(row),
            "counterpart": _raw_counterpart(row),
            "tiers": str(_value(row, "tiers", "fournisseur_client", "counterparty") or "").strip()[:255],
            "confidence": _value(row, "confiance", "confidence"),
            "position": index,
        })
    # Python's sort is stable, so same-date transactions retain their statement order.
    return sorted(result, key=lambda row: (row["date"], row["position"]))


def preview_entries(data):
    """Return a list of preview accounting rows (no DB writes) from an AI payload.

    Utilise classify_operation() pour produire directement les bons comptes
    Débit et Crédit selon la nature de l'opération.  Aucune écriture en base.
    Les sous-comptes 401xxx/411xxx sont laissés au compte générique (401000/411000)
    car l'entreprise n'est pas disponible ici.
    """
    try:
        lines = validated_lines(data)
    except BankStatementError:
        return []

    rows = []
    for row in lines:
        compte_debit, compte_credit = classify_operation(
            row["libelle"],
            row["direction"],
            row["counterpart"],
            row["tiers"],
            entreprise=None,
        )
        rows.append({
            "date": str(row["date"]),
            "libelle": row["libelle"],
            "ligne_num": row["position"],
            "compte_debit": compte_debit,
            "compte_credit": compte_credit,
            "montant": str(row["amount"]),
            "counterpart": row["counterpart"],
            "tiers": row["tiers"],
            "sens": row["direction"],
        })
    return rows


def resolve_counterpart_account(entreprise, raw_account, tiers_nom, libelle="", direction="credit"):
    """Compatibilité ascendante – délègue à classify_operation().

    Retourne uniquement le compte de contrepartie (celui qui n'est pas 512000).
    Préférer classify_operation() dans tout nouveau code.
    """
    compte_debit, compte_credit = classify_operation(
        libelle, direction, raw_account, tiers_nom, entreprise
    )
    # La contrepartie est le compte qui n'est pas la banque.
    if compte_debit != BANK_ACCOUNT:
        return compte_debit
    return compte_credit


def _resolve_exercice(entreprise, date):
    exercice = entreprise.exercices.filter(annee=date.year).first()
    if exercice:
        return exercice
    active = entreprise.exercices.filter(is_active=True).first()
    if active and active.annee == date.year:
        return active
    has_active = entreprise.exercices.filter(is_active=True).exists()
    return ExerciceAnnee.objects.create(
        entreprise=entreprise,
        annee=date.year,
        is_active=not has_active,
    )


def check_bank_operation_duplicate(entreprise, operation_date, reference, label, amount):
    """Vérifie si une opération bancaire identique existe déjà.

    Une opération n'est considérée comme un doublon que si tous les champs
    requis correspondent, dans l'ordre :
      1. Date
      2. N° de pièce
      3. Libellé
      4. Montant

    Le numéro de pièce seul ne suffit pas. Si la date, le libellé ou le montant
    diffère, l'opération est traitée comme une nouvelle opération.
    """
    if not reference:
        return None

    normalized_label = _normalize_label(label)
    amount_decimal = Decimal(str(amount))

    duplicate = (
        Ecriture.objects.filter(
            journal__entreprise=entreprise,
            journal__type_journal=Journal.Type.BANQUE,
            date_ecriture=operation_date,
            numero_piece=reference,
        )
        .prefetch_related("lignes")
        .first()
    )
    if not duplicate:
        return None

    for line in duplicate.lignes.all():
        if _normalize_label(line.libelle) != normalized_label:
            continue

        line_amount = Decimal(str(line.montant_debit or 0))
        if line_amount == amount_decimal:
            return duplicate

        line_amount = Decimal(str(line.montant_credit or 0))
        if line_amount == amount_decimal:
            return duplicate

    return None


@transaction.atomic
def import_bank_statement(entreprise, data):
    """Create one balanced two-line Banque entry per statement transaction.

    The accountant has explicitly reviewed and confirmed the extraction, so
    every created Ecriture is saved to Journal Banque and marked VALIDE immediately.
    """
    statement_account = _value(data, "numero_compte", "account_number", "compte_bancaire")
    validate_statement_account(entreprise, statement_account)
    lines = validated_lines(data)

    statement_ref = str(_value(data, "numero_piece", "numero_releve", "reference") or "").strip()

    journals = {}
    created = []
    for row in lines:
        exercice = _resolve_exercice(entreprise, row["date"])
        journal = journals.get((exercice.id, Journal.Type.BANQUE))
        if not journal:
            journal, _ = Journal.objects.get_or_create(
                entreprise=entreprise, annee=exercice, type_journal=Journal.Type.BANQUE
            )
            journals[(exercice.id, Journal.Type.BANQUE)] = journal

        try:
            confidence = int(row["confidence"]) if row["confidence"] is not None else None
        except (TypeError, ValueError):
            confidence = None

        ref = row["reference"] or statement_ref or f"RELEV-{row['date'].strftime('%Y%m%d')}"

        # ── Vérifier les doublons avant création ──────────────────────────────────
        duplicate_ecriture = check_bank_operation_duplicate(
            entreprise, row["date"], ref, row["libelle"], row["amount"]
        )
        if duplicate_ecriture:
            raise BankStatementError(
                f"Doublon détecté : l'opération du {row['date'].strftime('%d/%m/%Y')} "
                f"avec la référence « {ref} », le libellé « {row['libelle']} » "
                f"et le montant {row['amount']} DZD existe déjà (Écriture #{duplicate_ecriture.id})."
            )

        entry = Ecriture.objects.create(
            journal=journal,
            date_ecriture=row["date"],
            numero_piece=ref,
            fournisseur_client=row["tiers"],
            source=Ecriture.Source.IMPORT,
            confiance_ia=confidence,
            statut=Ecriture.Statut.VALIDE,
            mode_paiement="relevé bancaire",
            image_url=str(data.get("image_url") or ""),
        )
        compte_debit, compte_credit = classify_operation(
            row["libelle"], row["direction"], row["counterpart"], row["tiers"], entreprise
        )
        bank_account = enterprise_bank_account(entreprise, row["libelle"])
        if compte_debit == BANK_ACCOUNT:
            compte_debit = bank_account
        if compte_credit == BANK_ACCOUNT:
            compte_credit = bank_account
        counterpart_lines = apply_scf_subaccounts(
            entreprise,
            [
                {"compte": compte_debit, "libelle": row["libelle"]},
                {"compte": compte_credit, "libelle": row["libelle"]},
            ],
        )
        compte_debit, compte_credit = (
            counterpart_lines[0]["compte"], counterpart_lines[1]["compte"]
        )
        LigneEcriture.objects.create(
            ecriture=entry,
            numero_compte=compte_debit,
            libelle=row["libelle"],
            montant_debit=row["amount"],
            montant_credit=Decimal("0"),
        )
        LigneEcriture.objects.create(
            ecriture=entry,
            numero_compte=compte_credit,
            libelle=row["libelle"],
            montant_debit=Decimal("0"),
            montant_credit=row["amount"],
        )
        created.append(entry)

        # Automatic linked CAISSE entry for Versement operations
        try:
            lib_norm = _normalize_label(row["libelle"])
        except Exception:
            lib_norm = (row.get("libelle") or "").upper()
        if _label_contains_any(lib_norm, _KW_VERSEMENT):
            # Ensure a CAISSE journal exists for this exercice
            caisse_journal = journals.get((exercice.id, Journal.Type.CAISSE))
            if not caisse_journal:
                caisse_journal, _ = Journal.objects.get_or_create(
                    entreprise=entreprise, annee=exercice, type_journal=Journal.Type.CAISSE
                )
                journals[(exercice.id, Journal.Type.CAISSE)] = caisse_journal

            # Create the caisse entry: 581000 Debit / 530000 Credit
            caisse_entry = Ecriture.objects.create(
                journal=caisse_journal,
                date_ecriture=row["date"],
                numero_piece=ref,
                fournisseur_client=row["tiers"],
                source=Ecriture.Source.IMPORT,
                confiance_ia=confidence,
                statut=Ecriture.Statut.VALIDE,
                mode_paiement="versement",
                image_url=str(data.get("image_url") or ""),
            )
            LigneEcriture.objects.create(
                ecriture=caisse_entry,
                numero_compte="581000",
                libelle=row["libelle"],
                montant_debit=row["amount"],
                montant_credit=Decimal("0"),
            )
            LigneEcriture.objects.create(
                ecriture=caisse_entry,
                numero_compte="530000",
                libelle=row["libelle"],
                montant_debit=Decimal("0"),
                montant_credit=row["amount"],
            )
            created.append(caisse_entry)
    return created
