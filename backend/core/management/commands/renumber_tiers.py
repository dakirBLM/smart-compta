"""Renumérote les tiers (fournisseurs 401xxx, clients 411xxx) séquentiellement
par date de création — 401001, 401002, … — et met à jour toutes les lignes
d'écritures qui référencent les anciens numéros, pour garder le grand livre,
la balance et les journaux cohérents.

Usage:  python manage.py renumber_tiers [--dry-run]
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import ClientComptable, Entreprise, Fournisseur, LigneEcriture


class Command(BaseCommand):
    help = "Renumérote les comptes tiers (401xxx / 411xxx) séquentiellement."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                            help="Affiche les changements sans les appliquer.")

    def handle(self, *args, **options):
        dry = options["dry_run"]
        for entreprise in Entreprise.objects.all():
            for model, prefix in ((Fournisseur, "401"), (ClientComptable, "411")):
                tiers = list(model.objects.filter(entreprise=entreprise)
                             .order_by("created_at", "id"))
                if not tiers:
                    continue
                with transaction.atomic():
                    # Phase 1: numéros temporaires pour éviter les collisions
                    # d'unicité pendant le ré-ordonnancement.
                    old_numbers = {}
                    for i, t in enumerate(tiers, start=1):
                        old_numbers[t.id] = t.numero_compte
                        if not dry:
                            t.numero_compte = f"TMP-{prefix}-{i}"
                            t.save(update_fields=["numero_compte"])
                    # Phase 2: numéros définitifs + mise à jour des écritures.
                    for i, t in enumerate(tiers, start=1):
                        new_num = f"{prefix}{i:03d}"
                        old_num = old_numbers[t.id]
                        if old_num == new_num:
                            if not dry:
                                t.numero_compte = new_num
                                t.save(update_fields=["numero_compte"])
                            continue
                        updated = 0
                        if not dry:
                            t.numero_compte = new_num
                            t.save(update_fields=["numero_compte"])
                            updated = LigneEcriture.objects.filter(
                                ecriture__journal__entreprise=entreprise,
                                numero_compte=old_num,
                            ).update(numero_compte=new_num)
                        self.stdout.write(
                            f"[{entreprise.nom}] {model.__name__} « {t.nom} » : "
                            f"{old_num} -> {new_num}"
                            + (f" ({updated} ligne(s) d'écriture mise(s) à jour)"
                               if not dry else " (dry-run)")
                        )
        self.stdout.write(self.style.SUCCESS(
            "Terminé." if not dry else "Dry-run terminé (aucun changement appliqué)."
        ))
