"""Fixtures shared by backend tests that need a company with registered banks."""
from .models import BankAccount, SCFAccount


def make_bank(entreprise, bank_name, account_number="", rib=""):
    """Register a bank for a company with its own named 512xxx ledger account."""
    used = SCFAccount.objects.filter(
        entreprise=entreprise, numero_compte__startswith="512"
    ).values_list("numero_compte", flat=True)
    suffixes = [int(number[3:]) for number in used if number[3:].isdigit()]
    scf_account = SCFAccount.objects.create(
        entreprise=entreprise,
        numero_compte=f"512{max(suffixes, default=0) + 1:03d}",
        libelle=f"BANQUE {bank_name}",
        classe=5,
    )
    return BankAccount.objects.create(
        entreprise=entreprise,
        bank_name=bank_name,
        account_number=account_number,
        rib=rib,
        scf_account=scf_account,
    )
