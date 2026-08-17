"""Import SCF accounts from a CSV file.

CSV expected columns: classe, numero_compte, libelle

Usage:
  python manage.py import_scf /path/to/LA_TABLE_SCF.csv

If no path provided, it will try the user's Downloads folder (Windows):
C:\\Users\\<username>\\Downloads\\LA_TABLE_SCF.csv
"""
import csv
import os
from django.core.management.base import BaseCommand
from django.db import transaction
from core.models import SCFAccount


class Command(BaseCommand):
    help = "Import SCF accounts from a CSV file into SCFAccount (no duplicates)."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", nargs="?", help="Path to the CSV file")

    def handle(self, *args, **options):
        path = options.get("csv_path")
        if not path:
            # Try default Downloads path on Windows
            home = os.path.expanduser("~")
            path = os.path.join(home, "Downloads", "LA_TABLE_SCF.csv")

        if not os.path.exists(path):
            self.stderr.write(self.style.ERROR(f"CSV file not found: {path}"))
            return

        created = 0
        skipped = 0
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            with transaction.atomic():
                for row in reader:
                    numero = (row.get("numero_compte") or row.get("numero") or "").strip()
                    libelle = (row.get("libelle") or row.get("label") or "").strip()
                    classe = row.get("classe")
                    if not numero:
                        skipped += 1
                        continue
                    try:
                        classe_val = int(str(numero).strip()[0])
                    except Exception:
                        classe_val = 0
                    # Do not import duplicates (global entries: entreprise is null)
                    obj, created_flag = SCFAccount.objects.get_or_create(
                        entreprise=None,
                        numero_compte=numero,
                        defaults={"libelle": libelle, "classe": classe_val},
                    )
                    if created_flag:
                        created += 1
                    else:
                        skipped += 1

        self.stdout.write(self.style.SUCCESS(f"Import complete. Created={created}, Skipped={skipped}"))
