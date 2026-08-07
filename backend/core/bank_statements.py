"""Validation and posting of AI-extracted bank statements.

The AI is deliberately responsible only for reading/classifying a statement.
This module remains the accounting authority: it validates the statement bank
account and builds both sides of every entry itself.
"""
from datetime import datetime
from decimal import Decimal, InvalidOperation
import re

from django.core.exceptions import ValidationError
from django.db import transaction

from .account_helpers import get_or_create_client_comptable, get_or_create_fournisseur
from .models import Ecriture, ExerciceAnnee, Journal, LigneEcriture


BANK_ACCOUNT = "512000"


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
        raise BankStatementError("Chaque montant du relevé doit être strictement positif.")
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
        return _decimal(v, "débit/crédit") > 0
    if nonzero(debit) != nonzero(credit):
        return "debit" if nonzero(debit) else "credit"
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


def _counterpart(row):
    account = str(_value(row, "compte_contrepartie", "compte", "counterpart_account") or "").strip()
    if not re.fullmatch(r"\d{3,20}", account):
        raise BankStatementError(
            "Chaque ligne doit contenir un compte de contrepartie numérique "
            "(ex. 401000 ou 411000)."
        )
    if account == BANK_ACCOUNT:
        raise BankStatementError("Le compte de contrepartie ne peut pas être 512000.")
    return account


def validated_lines(data):
    """Normalize the Make payload before any database mutation occurs."""
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
            "counterpart": _counterpart(row),
            "tiers": str(_value(row, "tiers", "fournisseur_client", "counterparty") or "").strip()[:255],
            "confidence": _value(row, "confiance", "confidence"),
            "position": index,
        })
    # Python's sort is stable, so same-date transactions retain their statement order.
    return sorted(result, key=lambda row: (row["date"], row["position"]))


def resolve_counterpart_account(entreprise, raw_account, tiers_nom):
    """Resolve a generic 401/411 range to the named tiers' own dedicated
    sub-account (e.g. 401000 -> 401007), the same registry the invoice
    scanner uses. Without this, every "chèque retour" line would post to the
    same generic 401000/411000 account instead of the actual fournisseur/
    client, and pollute the account_helpers suffix sequence (see its
    docstring). Falls back to the AI-provided account when there's no tiers
    name or the account isn't in the 401/411 range."""
    tiers_nom = (tiers_nom or "").strip()
    if not tiers_nom:
        return raw_account
    try:
        if raw_account.startswith("401"):
            return get_or_create_fournisseur(entreprise, tiers_nom).numero_compte
        if raw_account.startswith("411"):
            return get_or_create_client_comptable(entreprise, tiers_nom).numero_compte
    except ValidationError:
        return raw_account
    return raw_account


def _resolve_exercice(entreprise, date):
    exercice = entreprise.exercices.filter(annee=date.year).first()
    if exercice:
        return exercice
    return ExerciceAnnee.objects.create(entreprise=entreprise, annee=date.year, is_active=False)


@transaction.atomic
def import_bank_statement(entreprise, data):
    """Create one balanced two-line Banque entry per statement transaction."""
    statement_account = _value(data, "numero_compte", "account_number", "compte_bancaire")
    validate_statement_account(entreprise, statement_account)
    lines = validated_lines(data)

    journals = {}
    created = []
    for row in lines:
        exercice = _resolve_exercice(entreprise, row["date"])
        journal = journals.get(exercice.id)
        if not journal:
            journal, _ = Journal.objects.get_or_create(
                entreprise=entreprise, annee=exercice, type_journal=Journal.Type.BANQUE
            )
            journals[exercice.id] = journal

        try:
            confidence = int(row["confidence"]) if row["confidence"] is not None else None
        except (TypeError, ValueError):
            confidence = None
        entry = Ecriture.objects.create(
            journal=journal,
            date_ecriture=row["date"],
            numero_piece=row["reference"],
            fournisseur_client=row["tiers"],
            source=Ecriture.Source.IMPORT,
            confiance_ia=confidence,
            statut=Ecriture.Statut.EN_COURS,
            mode_paiement="relevé bancaire",
        )
        # The direction describes account 512000, as stipulated by the import contract.
        bank_debit = row["amount"] if row["direction"] == "debit" else Decimal("0")
        bank_credit = row["amount"] if row["direction"] == "credit" else Decimal("0")
        counterpart = resolve_counterpart_account(entreprise, row["counterpart"], row["tiers"])
        LigneEcriture.objects.bulk_create([
            LigneEcriture(
                ecriture=entry, numero_compte=BANK_ACCOUNT, libelle=row["libelle"],
                montant_debit=bank_debit, montant_credit=bank_credit,
            ),
            LigneEcriture(
                ecriture=entry, numero_compte=counterpart, libelle=row["libelle"],
                montant_debit=bank_credit, montant_credit=bank_debit,
            ),
        ])
        created.append(entry)
    return created
