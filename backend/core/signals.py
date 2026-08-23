from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Fournisseur, ClientComptable, LigneEcriture, SCFAccount


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
    # Add any account used in a LigneEcriture to the SCF for the corresponding entreprise
    if not instance.numero_compte:
        return

    # Check if the exact account already exists globally (e.g. "401")
    # If so, do not create a duplicate in the local SCF.
    if SCFAccount.objects.filter(entreprise__isnull=True, numero_compte=instance.numero_compte).exists():
        return

    # Determine entreprise via the ecriture -> journal -> entreprise
    ent = None
    try:
        ent = instance.ecriture.journal.entreprise
    except Exception:
        pass

    libelle = instance.libelle or ""

    # If the account is a bank account (starts with 512), use a better libelle
    if instance.numero_compte.startswith("512"):
        if ent and ent.banque:
            libelle = f"Banque - {ent.banque}"
        else:
            libelle = "Banque"
    else:
        # Avoid generic labels from transaction descriptions for padded accounts (like 401000, 411000, 530000)
        # or for any account created during an import/scanner (where libelle is just the bank description/AI extract)
        inherited = get_inherited_label(instance.numero_compte)
        if inherited:
            is_import_or_scanner = instance.ecriture.source in ("import", "scanner")
            is_padded_generic = instance.numero_compte.endswith("000")
            
            if is_padded_generic or is_import_or_scanner or not libelle:
                libelle = inherited

    # Create entreprise-specific SCF entry (if not exists).
    SCFAccount.objects.get_or_create(
        entreprise=ent,
        numero_compte=instance.numero_compte,
        defaults={"libelle": libelle},
    )

from .models import Entreprise

@receiver(post_save, sender=Entreprise)
def update_entreprise_bank_scf(sender, instance: Entreprise, created, **kwargs):
    """Automatically ensure the 512000 SCF account exists and is named after the entreprise's bank."""
    if instance.banque:
        # Create or update the 512000 account to reflect the bank name.
        obj, created_flag = SCFAccount.objects.get_or_create(
            entreprise=instance,
            numero_compte="512000",
            defaults={"libelle": f"Banque - {instance.banque}"}
        )
        if not created_flag:
            # Update it if the name is not correct
            new_libelle = f"Banque - {instance.banque}"
            if obj.libelle != new_libelle:
                obj.libelle = new_libelle
                obj.save(update_fields=["libelle"])
