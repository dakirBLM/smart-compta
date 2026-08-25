from datetime import date

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import ClientComptable, Ecriture, Entreprise, ExerciceAnnee, Fournisseur, Journal, SCFAccount


class BankStatementImportTests(APITestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(
            username="comptable", password="secret", role="accountant"
        )
        self.enterprise = Entreprise.objects.create(
            nom="ACME", nif="1", nis="2", date_creation=date(2026, 1, 1),
            exercice_comptable="2026", banque="BNA", numero_compte="001 234-56", accountant=user,
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
        bank_line = next(line for line in first if line.numero_compte == "512001")
        self.assertEqual(bank_line.montant_debit + bank_line.montant_credit, 200)
        self.assertEqual(
            sum(line.montant_debit + line.montant_credit for line in first if line is not bank_line),
            200,
        )
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


class EcritureScfValidationTests(APITestCase):
    def setUp(self):
        user = get_user_model().objects.create_user(
            username="scf-comptable", password="secret", role="accountant"
        )
        SCFAccount.objects.create(numero_compte="512", libelle="Banques", classe=5)
        SCFAccount.objects.create(numero_compte="401", libelle="Fournisseurs", classe=4)
        SCFAccount.objects.create(numero_compte="411", libelle="Clients", classe=4)
        SCFAccount.objects.create(numero_compte="53", libelle="Caisse", classe=5)
        self.enterprise = Entreprise.objects.create(
            nom="SCF TEST", nif="11", nis="22", date_creation=date(2026, 1, 1),
            exercice_comptable="2026", banque="BNA", accountant=user,
        )
        year = ExerciceAnnee.objects.create(
            entreprise=self.enterprise, annee=2026, is_active=True
        )
        journal = Journal.objects.create(
            entreprise=self.enterprise, annee=year, type_journal=Journal.Type.OD
        )
        self.url = f"/api/entreprises/{self.enterprise.id}/journaux/{journal.id}/ecritures/"
        self.client.force_authenticate(user)

    def test_unknown_account_is_rejected(self):
        response = self.client.post(self.url, {
            "date_ecriture": "2026-01-01",
            "lignes": [
                {"numero_compte": "4111", "libelle": "Client", "montant_debit": "10", "montant_credit": "0"},
                {"numero_compte": "512001", "libelle": "Banque", "montant_debit": "0", "montant_credit": "10"},
            ],
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("SCF", str(response.data))
        self.assertEqual(Ecriture.objects.count(), 0)

    def test_bank_subaccount_uses_enterprise_bank_label(self):
        response = self.client.post(self.url, {
            "date_ecriture": "2026-01-01",
            "lignes": [
                {"numero_compte": "411", "libelle": "Client", "montant_debit": "10", "montant_credit": "0"},
                {"numero_compte": "512001", "libelle": "Banque", "montant_debit": "0", "montant_credit": "10"},
            ],
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        account = SCFAccount.objects.get(entreprise=self.enterprise, numero_compte="512001")
        self.assertEqual(account.libelle, "BANQUE BNA")

    def test_scf_api_nests_dynamic_accounts_under_parent(self):
        Fournisseur.objects.create(
            entreprise=self.enterprise, nom="Fournisseur A", numero_compte="401001"
        )
        response = self.client.get(f"/api/entreprises/{self.enterprise.id}/scf/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        accounts = response.data["4"] + response.data["5"]
        self.assertEqual(
            [account for account in accounts if account["numero_compte"] == "401001"],
            [{"numero_compte": "401001", "libelle": "Fournisseur A", "parent": "401"}],
        )
        self.assertEqual(
            len([account for account in accounts if account["numero_compte"] == "512001"]),
            1,
        )

    def test_scf_api_nests_other_dynamic_accounts_under_their_master_parent(self):
        SCFAccount.objects.create(
            entreprise=self.enterprise, numero_compte="530001", libelle="Petite caisse", classe=5
        )
        response = self.client.get(f"/api/entreprises/{self.enterprise.id}/scf/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        caisse = next(account for account in response.data["5"] if account["numero_compte"] == "530001")
        self.assertEqual(caisse["parent"], "53")
