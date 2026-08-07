from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import ClientComptable, Ecriture, Entreprise, ExerciceAnnee, Fournisseur


class BankStatementImportTests(APITestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(
            username="comptable", password="secret", role="accountant"
        )
        self.enterprise = Entreprise.objects.create(
            nom="ACME", nif="1", nis="2", date_creation=date(2026, 1, 1),
            exercice_comptable="2026", numero_compte="001 234-56", accountant=user,
        )
        ExerciceAnnee.objects.create(entreprise=self.enterprise, annee=2026, is_active=True)
        self.client.force_authenticate(user)
        self.url = f"/api/entreprises/{self.enterprise.id}/releves-bancaires/import/"

    def test_import_sorts_lines_and_creates_balanced_inverse_entries(self):
        response = self.client.post(self.url, {
            "numero_compte": "00123456",
            "lignes": [
                {"date": "05/02/2026", "libelle": "Virement fournisseur", "montant": "100,50", "sens": "credit", "compte_contrepartie": "401000"},
                {"date": "04/02/2026", "libelle": "Chèque retour client", "montant": "200", "sens": "debit", "compte_contrepartie": "411000"},
            ],
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["ecritures_creees"], 2)
        entries = list(Ecriture.objects.order_by("date_ecriture", "id").prefetch_related("lignes"))
        self.assertEqual([str(e.date_ecriture) for e in entries], ["2026-02-04", "2026-02-05"])
        first = list(entries[0].lignes.all())
        self.assertEqual(first[0].numero_compte, "512000")
        self.assertEqual(str(first[0].montant_debit), "200.00")
        self.assertEqual(first[1].numero_compte, "411000")
        self.assertEqual(str(first[1].montant_credit), "200.00")
        self.assertEqual(entries[0].total_debit, entries[0].total_credit)

    def test_mismatched_statement_account_is_rejected_before_creating_entries(self):
        response = self.client.post(self.url, {
            "numero_compte": "99999999",
            "lignes": [{"date": "04/02/2026", "libelle": "Test", "montant": 1, "sens": "debit", "compte_contrepartie": "401000"}],
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Ecriture.objects.count(), 0)

    def test_import_resolves_named_tiers_to_their_own_dedicated_account(self):
        response = self.client.post(self.url, {
            "numero_compte": "00123456",
            "lignes": [
                {"date": "04/02/2026", "libelle": "Chèque retour fournisseur",
                 "montant": "866041.72", "sens": "credit", "compte_contrepartie": "401000",
                 "tiers": "Fournisseur Test"},
            ],
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        fournisseur = Fournisseur.objects.get(entreprise=self.enterprise, nom="Fournisseur Test")
        self.assertNotEqual(fournisseur.numero_compte, "401000")
        entry = Ecriture.objects.get()
        lignes = {l.numero_compte: l for l in entry.lignes.all()}
        self.assertIn(fournisseur.numero_compte, lignes)
        self.assertNotIn("401000", lignes)

    def test_import_without_tiers_name_keeps_generic_counterpart_account(self):
        response = self.client.post(self.url, {
            "numero_compte": "00123456",
            "lignes": [
                {"date": "04/02/2026", "libelle": "Frais bancaires",
                 "montant": "50", "sens": "debit", "compte_contrepartie": "627000"},
            ],
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        entry = Ecriture.objects.get()
        self.assertIn("627000", {l.numero_compte for l in entry.lignes.all()})
        self.assertEqual(ClientComptable.objects.count(), 0)
        self.assertEqual(Fournisseur.objects.count(), 0)
