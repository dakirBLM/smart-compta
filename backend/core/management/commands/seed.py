"""Seed demo data: one accountant, one client, an entreprise with journals
and a few balanced écritures so the reports/dashboard render real numbers.

Run with:  python manage.py seed
"""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from core.models import (
    ClientAccess,
    Ecriture,
    Entreprise,
    ExerciceAnnee,
    Facture,
    Journal,
    LigneEcriture,
)

User = get_user_model()


class Command(BaseCommand):
    help = "Seed demo data for Smart Compta."

    def handle(self, *args, **options):
        accountant, created = User.objects.get_or_create(
            username="comptable",
            defaults={"role": User.Role.ACCOUNTANT, "email": "comptable@smartcompta.dz",
                      "phone": "0550000000"},
        )
        if created:
            accountant.set_password("comptable")
            accountant.save()
            self.stdout.write("Created accountant: comptable / comptable")

        ent, _ = Entreprise.objects.get_or_create(
            nif="000123456789012",
            defaults=dict(
                nom="SARL ABC", nis="000987654321098", date_creation=date(2020, 1, 1),
                adresse="12 Rue Didouche Mourad", ville="Alger", code_postal="16000",
                exercice_comptable="2024", banque="BNA", numero_compte="00100123456789",
                rib="00100123456789012345", regime_fiscale="Réel", activite="Commerce",
                telephone="021000000", email="contact@sarlabc.dz", accountant=accountant,
            ),
        )

        annee, _ = ExerciceAnnee.objects.get_or_create(
            entreprise=ent, annee=2024, defaults={"is_active": True}
        )

        client, c_created = User.objects.get_or_create(
            username="client",
            defaults={"role": User.Role.CLIENT, "email": "client@sarlabc.dz",
                      "phone": "0660000000"},
        )
        if c_created:
            client.set_password("client")
            client.save()
            self.stdout.write("Created client: client / client")
        ClientAccess.objects.get_or_create(
            client=client, entreprise=ent, defaults={"nom_client": "SARL ABC"}
        )

        journal_achat, _ = Journal.objects.get_or_create(
            entreprise=ent, annee=annee, type_journal=Journal.Type.ACHAT
        )
        journal_vente, _ = Journal.objects.get_or_create(
            entreprise=ent, annee=annee, type_journal=Journal.Type.VENTE
        )

        if not journal_achat.ecritures.exists():
            self._achat(journal_achat, date(2024, 5, 15), "F2024-0158",
                        "SARL ABC", 100000, 19000)
            self._achat(journal_achat, date(2024, 6, 10), "F2024-0210",
                        "ETS Distrib", 50000, 9500)
            self._vente(journal_vente, date(2024, 5, 20), "FV-001",
                        "Client X", 200000, 38000)
            self._vente(journal_vente, date(2024, 6, 25), "FV-002",
                        "Client Y", 150000, 28500)
            self.stdout.write("Created demo écritures.")

        Facture.objects.get_or_create(
            entreprise=ent, client=client, numero_facture="F2024-0158",
            defaults=dict(date_facture=date(2024, 5, 15), montant_ht=100000,
                          tva_pourcentage=19, montant_tva=19000, montant_ttc=119000,
                          statut=Facture.Statut.VALIDE, confiance_ia=95),
        )

        self.stdout.write(self.style.SUCCESS("Seed complete."))

    def _achat(self, journal, d, piece, fournisseur, ht, tva):
        ec = Ecriture.objects.create(
            journal=journal, date_ecriture=d, numero_piece=piece,
            fournisseur_client=fournisseur, source=Ecriture.Source.MANUEL,
            statut=Ecriture.Statut.VALIDE,
        )
        LigneEcriture.objects.create(ecriture=ec, numero_compte="6011",
                                     libelle="Achats de marchandises",
                                     montant_debit=ht, montant_credit=0)
        LigneEcriture.objects.create(ecriture=ec, numero_compte="44566",
                                     libelle="TVA déductible",
                                     montant_debit=tva, montant_credit=0)
        LigneEcriture.objects.create(ecriture=ec, numero_compte="4011",
                                     libelle="Fournisseurs",
                                     montant_debit=0, montant_credit=ht + tva)

    def _vente(self, journal, d, piece, client_nom, ht, tva):
        ec = Ecriture.objects.create(
            journal=journal, date_ecriture=d, numero_piece=piece,
            fournisseur_client=client_nom, source=Ecriture.Source.MANUEL,
            statut=Ecriture.Statut.VALIDE,
        )
        LigneEcriture.objects.create(ecriture=ec, numero_compte="411",
                                     libelle="Clients",
                                     montant_debit=ht + tva, montant_credit=0)
        LigneEcriture.objects.create(ecriture=ec, numero_compte="701",
                                     libelle="Ventes de marchandises",
                                     montant_debit=0, montant_credit=ht)
        LigneEcriture.objects.create(ecriture=ec, numero_compte="44571",
                                     libelle="TVA collectée",
                                     montant_debit=0, montant_credit=tva)
