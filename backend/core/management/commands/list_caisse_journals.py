from django.core.management.base import BaseCommand
import json

from core.models import Entreprise, Journal


class Command(BaseCommand):
    help = "List CAISSE journals per entreprise with ecritures counts (JSON)."

    def handle(self, *args, **options):
        out = []
        for e in Entreprise.objects.all():
            js = Journal.objects.filter(entreprise=e, type_journal=Journal.Type.CAISSE).select_related('annee')
            arr = []
            for j in js:
                arr.append({
                    'id': j.id,
                    'annee': j.annee.annee if j.annee else None,
                    'ecritures_count': j.ecritures.count(),
                    'created_at': j.created_at.isoformat(),
                })
            if arr:
                out.append({'entreprise_id': e.id, 'nom': e.nom, 'journaux': arr})
        self.stdout.write(json.dumps(out, ensure_ascii=False, indent=2))
