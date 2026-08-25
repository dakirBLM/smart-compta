"""Import SCF accounts from a CSV file.

CSV expected columns: classe, numero_compte, libelle

Usage:
  python manage.py import_scf                          # use backend/data/LA_TABLE_SCF.csv
  python manage.py import_scf /path/to/LA_TABLE_SCF.csv  # custom path

Default path (no argument): backend/data/LA_TABLE_SCF.csv
This works locally and in production (Vercel, etc.) without relying on user's Downloads folder.
"""
import csv
from pathlib import Path
from django.core.management.base import BaseCommand
from django.db import transaction
from django.conf import settings
from core.models import SCFAccount


class Command(BaseCommand):
    help = "Import SCF accounts from a CSV file into SCFAccount (no duplicates)."

    def add_arguments(self, parser):
        parser.add_argument("csv_path", nargs="?", help="Path to the CSV file (default: backend/data/LA_TABLE_SCF.csv)")

    def handle(self, *args, **options):
        path_arg = options.get("csv_path")
        if path_arg:
            # User provided a custom path
            path = Path(path_arg)
        else:
            # Default to backend/data/LA_TABLE_SCF.csv (relative to BASE_DIR)
            base_dir = settings.BASE_DIR
            path = base_dir / "data" / "LA_TABLE_SCF.csv"
        
        if not path.exists():
            self.stderr.write(self.style.ERROR(f"CSV file not found: {path.resolve()}"))
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
                    if numero in {"44566", "645000"}:
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
