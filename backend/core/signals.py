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
        banque = {
            "512001": ent.banque,
            "512002": ent.banque2,
        }.get(instance.numero_compte)
        if not banque:
            return
        SCFAccount.objects.update_or_create(
            entreprise=ent,
            numero_compte=instance.numero_compte,
            defaults={"libelle": f"BANQUE {banque}"},
        )
        return

    inherited = get_inherited_label(instance.numero_compte) or instance.libelle
    if inherited:
        SCFAccount.objects.update_or_create(
            entreprise=ent,
            numero_compte=instance.numero_compte,
            defaults={"libelle": inherited},
        )

from .models import Entreprise

@receiver(post_save, sender=Entreprise)
def update_entreprise_bank_scf(sender, instance: Entreprise, created, **kwargs):
    for numero_compte, banque in (("512001", instance.banque), ("512002", instance.banque2)):
        if banque and SCFAccount.objects.filter(
            entreprise__isnull=True, numero_compte="512"
        ).exists():
            SCFAccount.objects.update_or_create(
                entreprise=instance,
                numero_compte=numero_compte,
                defaults={"libelle": f"BANQUE {banque}"},
            )
