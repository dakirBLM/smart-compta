"""Backfill SCFAccount entries from existing LigneEcriture rows.

Usage:
  python manage.py sync_scf_from_ledger

This will scan all LigneEcriture and create SCFAccount rows per entreprise
for any account numbers found (avoids duplicates).
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from core.models import LigneEcriture, SCFAccount
from collections import defaultdict


class Command(BaseCommand):
    help = "Create SCFAccount entries from existing ledger lines (LigneEcriture)."

    def handle(self, *args, **options):
        created = 0
        seen = 0
        # Group by entreprise (could be None if ecriture/journal missing)
        groups = defaultdict(set)
        for l in LigneEcriture.objects.select_related("ecriture__journal__entreprise").all():
            try:
                ent = l.ecriture.journal.entreprise
            except Exception:
                ent = None
            if not l.numero_compte:
                continue
            groups[ent].add((l.numero_compte, l.libelle or ""))

        with transaction.atomic():
            for ent, items in groups.items():
                for numero, libelle in items:
                    if not SCFAccount.objects.filter(
                        entreprise__isnull=True, numero_compte=numero
                    ).exists() and not SCFAccount.objects.filter(
                        entreprise=ent, numero_compte=numero
                    ).exists():
                        continue
                    obj, created_flag = SCFAccount.objects.get_or_create(
                        entreprise=ent,
                        numero_compte=numero,
                        defaults={"libelle": libelle},
                    )
                    if created_flag:
                        created += 1
                    else:
                        seen += 1
        self.stdout.write(self.style.SUCCESS(f"Done. Created={created}, Existing={seen}"))
