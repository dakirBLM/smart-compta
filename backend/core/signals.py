from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import (
    BankAccount, ClientComptable, Entreprise, Fournisseur, LigneEcriture, SCFAccount,
)


@receiver(post_save, sender=Fournisseur)
def add_fournisseur_to_scf(sender, instance: Fournisseur, created, **kwargs):
    if not instance.numero_compte:
        return
    # Add to SCF as Classe 4 (401xxx), or update if name changed
    obj, was_created = SCFAccount.objects.get_or_create(
        entreprise=instance.entreprise,
        numero_compte=instance.numero_compte,
        defaults={"libelle": instance.nom},
    )
    if not was_created and obj.libelle != instance.nom:
        obj.libelle = instance.nom
        obj.save(update_fields=["libelle"])


@receiver(post_save, sender=ClientComptable)
def add_client_to_scf(sender, instance: ClientComptable, created, **kwargs):
    if not instance.numero_compte:
        return
    # Add to SCF as Classe 4 (411xxx), or update if name changed
    obj, was_created = SCFAccount.objects.get_or_create(
        entreprise=instance.entreprise,
        numero_compte=instance.numero_compte,
        defaults={"libelle": instance.nom},
    )
    if not was_created and obj.libelle != instance.nom:
        obj.libelle = instance.nom
        obj.save(update_fields=["libelle"])



def get_inherited_label(numero_compte):
    # Check prefix from longest to shortest
    for i in range(len(numero_compte)-1, 0, -1):
        prefix = numero_compte[:i]
        match = SCFAccount.objects.filter(entreprise__isnull=True, numero_compte=prefix).first()
        if match:
            return match.libelle
    return ""

@receiver(post_save, sender=LigneEcriture)
def add_ligne_compte_to_scf(sender, instance: LigneEcriture, created, **kwargs):
    if not instance.numero_compte:
        return

    ent = None
    try:
        ent = instance.ecriture.journal.entreprise
    except Exception:
        pass
    if not ent or not SCFAccount.objects.filter(
        entreprise__isnull=True, numero_compte=instance.numero_compte
    ).exists():
        return

    if instance.numero_compte.startswith("512"):
        # Bank accounts are created (and labelled) from BankAccount rows, never
        # inferred from a ledger line.
        return

    inherited = get_inherited_label(instance.numero_compte) or instance.libelle
    if inherited:
        SCFAccount.objects.get_or_create(
            entreprise=ent,
            numero_compte=instance.numero_compte,
            defaults={"libelle": inherited},
        )

LEGACY_BANK_FIELDS = (
    ("banque", "numero_compte", "rib"),
    ("banque2", "numero_compte2", "rib2"),
)


def sync_legacy_bank_fields(entreprise_id):
    """Mirror the first two BankAccount rows into the legacy Entreprise columns.

    BankAccount is the source of truth. The old banque/banque2 columns are kept
    read-only so older readers still see consistent values.
    """
    banks = list(BankAccount.objects.filter(entreprise_id=entreprise_id).order_by("id")[:2])
    values = {}
    for index, (name_field, number_field, rib_field) in enumerate(LEGACY_BANK_FIELDS):
        bank = banks[index] if index < len(banks) else None
        values[name_field] = bank.bank_name if bank else ""
        values[number_field] = bank.account_number if bank else ""
        values[rib_field] = bank.rib if bank else ""
    Entreprise.objects.filter(pk=entreprise_id).update(**values)


@receiver(post_save, sender=BankAccount)
def mirror_bank_account_saved(sender, instance: BankAccount, **kwargs):
    sync_legacy_bank_fields(instance.entreprise_id)


@receiver(post_delete, sender=BankAccount)
def mirror_bank_account_deleted(sender, instance: BankAccount, **kwargs):
    sync_legacy_bank_fields(instance.entreprise_id)
