from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Fournisseur, ClientComptable, SCFAccount


@receiver(post_save, sender=Fournisseur)
def add_fournisseur_to_scf(sender, instance: Fournisseur, created, **kwargs):
    if not created:
        return
    # Add to SCF as Classe 4 (401xxx)
    numero = instance.numero_compte
    if not numero:
        return
    SCFAccount.objects.get_or_create(
        entreprise=instance.entreprise,
        numero_compte=numero,
        defaults={"libelle": instance.nom},
    )


@receiver(post_save, sender=ClientComptable)
def add_client_to_scf(sender, instance: ClientComptable, created, **kwargs):
    if not created:
        return
    # Add to SCF as Classe 4 (411xxx)
    numero = instance.numero_compte
    if not numero:
        return
    SCFAccount.objects.get_or_create(
        entreprise=instance.entreprise,
        numero_compte=numero,
        defaults={"libelle": instance.nom},
    )


from django.db.models.signals import post_save
from .models import LigneEcriture


@receiver(post_save, sender=LigneEcriture)
def add_ligne_compte_to_scf(sender, instance: LigneEcriture, created, **kwargs):
    # Add any account used in a LigneEcriture to the SCF for the corresponding entreprise
    if not instance.numero_compte:
        return
    # Determine entreprise via the ecriture -> journal -> entreprise
    ent = None
    try:
        ent = instance.ecriture.journal.entreprise
    except Exception:
        ent = None
    # Create entreprise-specific SCF entry (if not exists). If a global entry exists
    # (entreprise is null) we don't modify it; we still create the entreprise-specific
    # record so the SCF view shows both global and entreprise entries.
    SCFAccount.objects.get_or_create(
        entreprise=ent,
        numero_compte=instance.numero_compte,
        defaults={"libelle": instance.libelle or ""},
    )
