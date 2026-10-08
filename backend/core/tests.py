import csv
from datetime import date
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import BankStatement, ClientComptable, Ecriture, Entreprise, ExerciceAnnee, Facture, Fournisseur, Journal, LigneEcriture, SCFAccount
from .account_helpers import apply_scf_subaccounts
from .scanner import persist_extraction


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
            "nom_banque": "BNA",
            "nom_entreprise": "ACME",
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
            "nom_banque": "CPA",
            "nom_entreprise": "ACME",
            "lignes": [{"date": "04/02/2026", "libelle": "Test", "montant": 1, "sens": "debit", "compte_contrepartie": "401000"}],
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Ecriture.objects.count(), 0)

    def test_import_without_legacy_identity_fields_uses_enterprise_profile(self):
        response = self.client.post(self.url, {
            "lignes": [{
                "date": "04/02/2026",
                "libelle": "Frais bancaires",
                "montant": 50,
                "sens": "debit",
                "compte_contrepartie": "627000",
            }],
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        statement = BankStatement.objects.get(entreprise=self.enterprise)
        self.assertEqual(statement.nom_banque, self.enterprise.banque)
        self.assertEqual(statement.nom_entreprise, self.enterprise.nom)

    def test_import_resolves_named_tiers_to_their_own_dedicated_account(self):
        response = self.client.post(self.url, {
            "nom_banque": "BNA",
            "nom_entreprise": "ACME",
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
            "nom_banque": "BNA",
            "nom_entreprise": "ACME",
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
                {"numero_compte": "999999", "libelle": "Compte inconnu", "montant_debit": "10", "montant_credit": "0"},
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

    def test_invoice_scf_families_get_named_reusable_subaccounts(self):
        for numero, libelle in (
            ("380", "Produit A"),
            ("381", "Matiere B"),
            ("382", "Fourniture C"),
            ("355", "Produit fini D"),
            ("512", "BNA"),
        ):
            SCFAccount.objects.create(
                numero_compte=numero, libelle=libelle, classe=int(numero[0])
            )

        lines = [
            {"compte": numero, "libelle": libelle}
            for numero, libelle in (
                ("380", "Produit A"),
                ("381", "Matiere B"),
                ("382", "Fourniture C"),
                ("355", "Produit fini D"),
                ("512", "BNA"),
            )
        ]
        first = apply_scf_subaccounts(self.enterprise, lines)
        second = apply_scf_subaccounts(self.enterprise, lines)

        self.assertEqual(
            [line["compte"] for line in first],
            ["380001", "381001", "382001", "355001", "512001"],
        )
        self.assertEqual(first, second)
        self.assertEqual(
            SCFAccount.objects.filter(
                entreprise=self.enterprise,
                numero_compte__in=["380001", "381001", "382001", "355001", "512001"],
            ).count(),
            5,
        )
        self.assertEqual(
            SCFAccount.objects.get(
                entreprise=self.enterprise, numero_compte="512001"
            ).libelle,
            "BANQUE BNA",
        )

    def test_second_bank_gets_its_own_named_subaccount(self):
        self.enterprise.banque2 = "CPA"
        self.enterprise.save(update_fields=["banque2"])
        SCFAccount.objects.create(numero_compte="512", libelle="Banques", classe=5)

        first = apply_scf_subaccounts(
            self.enterprise, [{"compte": "512", "libelle": "Paiement BNA"}]
        )
        second = apply_scf_subaccounts(
            self.enterprise, [{"compte": "512", "libelle": "Paiement CPA"}]
        )

        self.assertEqual(first[0]["compte"], "512001")
        self.assertEqual(second[0]["compte"], "512002")
        self.assertEqual(
            SCFAccount.objects.get(
                entreprise=self.enterprise, numero_compte="512002"
            ).libelle,
            "BANQUE CPA",
        )

    @patch("core.views.call_webhook")
    def test_scan_preview_contains_scf_subaccounts_before_confirmation(self, webhook):
        for numero in ("380", "512"):
            SCFAccount.objects.create(
                numero_compte=numero, libelle="Compte", classe=int(numero[0])
            )
        webhook.return_value = {
            "fournisseur": "Fournisseur A",
            "date_facture": "01/01/2026",
            "numero_facture": "FAC-1",
            "montant_ht": 100,
            "tva_pourcentage": 19,
            "montant_tva": 19,
            "montant_ttc": 119,
            "journal": "Achats",
            "confiance": 95,
            "lignes": [
                {"compte": "380", "libelle": "Produit A", "debit": 100, "credit": 0},
                {"compte": "512", "libelle": "BNA", "debit": 0, "credit": 100},
            ],
        }

        response = self.client.post(
            "/api/scanner/upload/",
            {"entreprise": self.enterprise.id, "image": "dGVzdA=="},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [line["compte"] for line in response.data["data"]["lignes"]],
            ["380001", "512001"],
        )
        self.assertEqual(Ecriture.objects.count(), 0)

    @patch("core.views.call_webhook")
    def test_scan_preview_replaces_generic_tier_account(self, webhook):
        SCFAccount.objects.create(numero_compte="401", libelle="Fournisseurs", classe=4)
        webhook.return_value = {
            "fournisseur": "Fournisseur Preview",
            "date_facture": "01/01/2026",
            "numero_facture": "FAC-2",
            "montant_ht": 100,
            "tva_pourcentage": 19,
            "montant_tva": 19,
            "montant_ttc": 119,
            "journal": "Achats",
            "confiance": 95,
            "lignes": [
                {"compte": "401000", "libelle": "Fournisseur Preview", "debit": 0, "credit": 119},
                {"compte": "6011", "libelle": "Achats", "debit": 119, "credit": 0},
            ],
        }

        response = self.client.post(
            "/api/scanner/upload/",
            {"entreprise": self.enterprise.id, "image": "dGVzdA=="},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        fournisseur = Fournisseur.objects.get(
            entreprise=self.enterprise, nom="Fournisseur Preview"
        )
        comptes = [line["compte"] for line in response.data["data"]["lignes"]]
        self.assertIn(fournisseur.numero_compte, comptes)
        self.assertNotIn("401000", comptes)
        self.assertEqual(Ecriture.objects.count(), 0)


class SCFReferenceDataTests(APITestCase):
    def test_class_5_labels_do_not_use_placeholder_me_s(self):
        csv_path = Path(__file__).resolve().parent.parent / "data" / "LA_TABLE_SCF.csv"
        with csv_path.open(encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))

        class_5_labels = [row["libelle"] for row in rows if row["classe"] == "5"]
        self.assertFalse(any("me-s" in label.lower() or "me-es" in label.lower() for label in class_5_labels))


class PurchaseInvoiceAccountingTests(APITestCase):
    def setUp(self):
        self.accountant = get_user_model().objects.create_user(
            username="purchase-accountant", role="accountant"
        )
        self.entreprise = Entreprise.objects.create(
            nom="Purchase Invoice Test", nif="purchase-1", nis="purchase-2",
            date_creation=date(2026, 1, 1), exercice_comptable="2026",
            accountant=self.accountant,
        )
        ExerciceAnnee.objects.create(
            entreprise=self.entreprise, annee=2026, is_active=True
        )
        SCFAccount.objects.create(
            numero_compte="380", libelle="Marchandises stockees", classe=3
        )
        self.client.force_authenticate(self.accountant)

    def _create_invoice(self, type_facture):
        return Facture.objects.create(
            entreprise=self.entreprise,
            client=self.accountant,
            numero_facture=f"FAC-{type_facture.upper()}-1",
            date_facture=date(2026, 1, 15),
            montant_ht=100,
            montant_tva=19,
            montant_ttc=119,
            statut=Facture.Statut.EN_COURS,
            fournisseur_client="Tiers Test",
            type_facture=type_facture,
        )

    def test_purchase_invoice_validation_uses_scf_stock_account_without_duplicate_entries(self):
        facture = self._create_invoice("achat")

        response = self.client.post(f"/api/factures/{facture.id}/validate/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ecriture = Ecriture.objects.get()
        comptes = list(ecriture.lignes.values_list("numero_compte", flat=True))
        self.assertIn("380000", comptes)
        self.assertNotIn("6011", comptes)
        self.assertEqual(Ecriture.objects.count(), 1)
        self.assertEqual(
            SCFAccount.objects.filter(
                entreprise__isnull=True, libelle__icontains="marchandises stock"
            ).count(),
            1,
        )

    def test_sales_invoice_accounting_is_unchanged(self):
        facture = self._create_invoice("vente")

        response = self.client.post(f"/api/factures/{facture.id}/validate/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        comptes = set(Ecriture.objects.get().lignes.values_list("numero_compte", flat=True))
        self.assertIn("700000", comptes)
        self.assertNotIn("380000", comptes)


class FactureDeletionTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.accountant = user_model.objects.create_user(
            username="delete-invoice-accountant", password="pass", role="accountant"
        )
        self.client_user = user_model.objects.create_user(
            username="delete-invoice-client", password="pass", role="client"
        )
        self.other_client = user_model.objects.create_user(
            username="other-delete-invoice-client", password="pass", role="client"
        )
        self.entreprise = Entreprise.objects.create(
            nom="Delete Invoice Test", nif="delete-1", nis="delete-2",
            date_creation=date(2026, 1, 1), exercice_comptable="2026",
            accountant=self.accountant,
        )
        year = ExerciceAnnee.objects.create(
            entreprise=self.entreprise, annee=2026, is_active=True
        )
        self.journal = Journal.objects.create(
            entreprise=self.entreprise, annee=year, type_journal=Journal.Type.ACHAT
        )
        self.facture = Facture.objects.create(
            entreprise=self.entreprise,
            client=self.client_user,
            numero_facture="FAC-DELETE-1",
            statut=Facture.Statut.VALIDE,
        )
        self.ecriture = Ecriture.objects.create(
            journal=self.journal,
            date_ecriture=date(2026, 1, 15),
            numero_piece="FAC-DELETE-1",
        )
        self.facture.ecriture = self.ecriture
        self.facture.save(update_fields=["ecriture"])
        LigneEcriture.objects.create(
            ecriture=self.ecriture, numero_compte="601000", montant_debit=100
        )
        LigneEcriture.objects.create(
            ecriture=self.ecriture, numero_compte="401000", montant_credit=100
        )
        self.unrelated_entry = Ecriture.objects.create(
            journal=self.journal,
            date_ecriture=date(2026, 1, 16),
            numero_piece="OTHER-ENTRY",
        )
        self.url = f"/api/factures/{self.facture.id}/"

    def test_deleting_invoice_removes_its_entry_and_lines_but_not_other_entries(self):
        self.client.force_authenticate(self.client_user)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Facture.objects.filter(pk=self.facture.pk).exists())
        self.assertFalse(Ecriture.objects.filter(pk=self.ecriture.pk).exists())
        self.assertFalse(LigneEcriture.objects.filter(ecriture_id=self.ecriture.pk).exists())
        self.assertTrue(Ecriture.objects.filter(pk=self.unrelated_entry.pk).exists())
        self.assertEqual(Ecriture.objects.filter(journal=self.journal).count(), 1)

    def test_deleting_invoice_removes_matching_caisse_entry_only(self):
        caisse_journal = Journal.objects.create(
            entreprise=self.entreprise,
            annee=self.journal.annee,
            type_journal=Journal.Type.CAISSE,
        )
        self.facture.date_facture = date(2026, 1, 15)
        self.facture.montant_ttc = 119
        self.facture.fournisseur_client = "Fournisseur Test"
        self.facture.mode_paiement = "espèces"
        self.facture.save(
            update_fields=[
                "date_facture",
                "montant_ttc",
                "fournisseur_client",
                "mode_paiement",
            ]
        )
        payment_entry = Ecriture.objects.create(
            journal=caisse_journal,
            date_ecriture=self.facture.date_facture,
            numero_piece=self.facture.numero_facture,
            fournisseur_client=self.facture.fournisseur_client,
            source=Ecriture.Source.IMPORT,
            mode_paiement=self.facture.mode_paiement,
        )
        LigneEcriture.objects.create(
            ecriture=payment_entry,
            numero_compte="411000",
            montant_debit=119,
        )
        LigneEcriture.objects.create(
            ecriture=payment_entry,
            numero_compte="530000",
            montant_credit=119,
        )
        unrelated_caisse_entry = Ecriture.objects.create(
            journal=caisse_journal,
            date_ecriture=date(2026, 1, 16),
            numero_piece="OTHER-CASH-ENTRY",
        )
        self.client.force_authenticate(self.client_user)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Facture.objects.filter(pk=self.facture.pk).exists())
        self.assertFalse(Ecriture.objects.filter(pk=self.ecriture.pk).exists())
        self.assertFalse(Ecriture.objects.filter(pk=payment_entry.pk).exists())
        self.assertFalse(
            LigneEcriture.objects.filter(ecriture_id=payment_entry.pk).exists()
        )
        self.assertTrue(
            Ecriture.objects.filter(pk=unrelated_caisse_entry.pk).exists()
        )

    def test_client_cannot_delete_another_clients_invoice(self):
        self.client.force_authenticate(self.other_client)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Facture.objects.filter(pk=self.facture.pk).exists())
        self.assertTrue(Ecriture.objects.filter(pk=self.ecriture.pk).exists())


class InvoiceReuseAfterEntryDeletionTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.accountant = user_model.objects.create_user(
            username="invoice-accountant", password="secret", role="accountant"
        )
        self.other_accountant = user_model.objects.create_user(
            username="other-accountant", password="secret", role="accountant"
        )
        self.entreprise = Entreprise.objects.create(
            nom="Invoice Test", nif="invoice-1", nis="invoice-2",
            date_creation=date(2026, 1, 1), exercice_comptable="2026",
            accountant=self.accountant,
        )
        self.other_entreprise = Entreprise.objects.create(
            nom="Other Invoice Test", nif="other-invoice-1", nis="other-invoice-2",
            date_creation=date(2026, 1, 1), exercice_comptable="2026",
            accountant=self.other_accountant,
        )
        year = ExerciceAnnee.objects.create(
            entreprise=self.entreprise, annee=2026, is_active=True
        )
        self.journal = Journal.objects.create(
            entreprise=self.entreprise, annee=year, type_journal=Journal.Type.ACHAT
        )
        self.client.force_authenticate(self.accountant)
        self.invoice_number = "FAC-RETRY-1"
        self.confirm_url = "/api/scanner/confirm/"

    def _confirm_data(self):
        return {
            "entreprise": self.entreprise.id,
            "data": {
                "numero_facture": self.invoice_number,
                "date_facture": "2026-01-15",
                "fournisseur": "Fournisseur Test",
                "montant_ht": 100,
                "tva_pourcentage": 19,
                "montant_tva": 19,
                "montant_ttc": 119,
                "journal": "Achats",
                "confiance": 95,
                "lignes": [],
            },
        }

    def _create_entry(self, entreprise, data, source="scanner"):
        return Ecriture.objects.create(
            journal=self.journal,
            date_ecriture=date(2026, 1, 15),
            numero_piece=data.get("numero_facture", ""),
            source=source,
        )

    def test_deleted_entry_allows_reaccounting_by_reusing_facture(self):
        old_entry = self._create_entry(self.entreprise, self._confirm_data()["data"])
        facture = Facture.objects.create(
            entreprise=self.entreprise,
            client=self.accountant,
            numero_facture=self.invoice_number,
            statut=Facture.Statut.VALIDE,
            ecriture=old_entry,
        )

        delete_response = self.client.delete(f"/api/ecritures/{old_entry.id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        facture.refresh_from_db()
        self.assertIsNone(facture.ecriture_id)

        with patch("core.views.persist_extraction", side_effect=self._create_entry):
            response = self.client.post(self.confirm_url, self._confirm_data(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        facture.refresh_from_db()
        self.assertEqual(facture.statut, Facture.Statut.VALIDE)
        self.assertEqual(facture.ecriture_id, response.data["id"])
        self.assertEqual(
            Facture.objects.filter(
                entreprise=self.entreprise, numero_facture=self.invoice_number
            ).count(),
            1,
        )

    def test_accountant_upload_reuses_facture_after_entry_deletion(self):
        old_entry = self._create_entry(self.entreprise, self._confirm_data()["data"])
        facture = Facture.objects.create(
            entreprise=self.entreprise,
            client=self.accountant,
            numero_facture=self.invoice_number,
            statut=Facture.Statut.VALIDE,
            ecriture=old_entry,
        )
        self.client.delete(f"/api/ecritures/{old_entry.id}/")

        payload = {
            "entreprise": self.entreprise.id,
            "numero_facture": self.invoice_number,
            "date_facture": "2026-01-15",
            "fournisseur_client": "Fournisseur Test",
            "montant_ht": "100",
            "tva_pourcentage": "19",
            "montant_tva": "19",
            "montant_ttc": "119",
            "confiance_ia": "95",
            "lignes": [],
        }
        with patch("core.views.persist_extraction", side_effect=self._create_entry):
            response = self.client.post("/api/factures/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        facture.refresh_from_db()
        self.assertEqual(facture.ecriture_id, response.data["ecriture"])
        self.assertEqual(
            Facture.objects.filter(
                entreprise=self.entreprise, numero_facture=self.invoice_number
            ).count(),
            1,
        )

    def test_scan_reuses_invoice_when_matching_virement_payment_remains(self):
        old_entry = self._create_entry(self.entreprise, self._confirm_data()["data"])
        facture = Facture.objects.create(
            entreprise=self.entreprise,
            client=self.accountant,
            numero_facture=self.invoice_number,
            date_facture=date(2026, 1, 15),
            montant_ttc=119,
            statut=Facture.Statut.VALIDE,
            ecriture=old_entry,
            mode_paiement="Virement",
            fournisseur_client="Fournisseur Test",
        )
        bank_journal = Journal.objects.create(
            entreprise=self.entreprise,
            annee=self.journal.annee,
            type_journal=Journal.Type.BANQUE,
        )
        payment_entry = Ecriture.objects.create(
            journal=bank_journal,
            date_ecriture=facture.date_facture,
            numero_piece=self.invoice_number,
            fournisseur_client=facture.fournisseur_client,
            source=Ecriture.Source.SCANNER,
            mode_paiement=facture.mode_paiement,
        )
        LigneEcriture.objects.create(
            ecriture=payment_entry,
            numero_compte="401000",
            montant_debit=119,
        )
        LigneEcriture.objects.create(
            ecriture=payment_entry,
            numero_compte="512000",
            montant_credit=119,
        )
        self.client.delete(f"/api/ecritures/{old_entry.id}/")

        payload = self._confirm_data()
        payload["data"]["mode_paiement"] = "Virement"
        persist_calls = []

        def persist_invoice_without_extra_payment(entreprise, data, source):
            persist_calls.append(data)
            return self._create_entry(entreprise, data, source)

        with patch(
            "core.views.persist_extraction",
            side_effect=persist_invoice_without_extra_payment,
        ):
            response = self.client.post(self.confirm_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(persist_calls[0]["mode_paiement"], "")
        self.assertEqual(Ecriture.objects.filter(pk=payment_entry.pk).count(), 1)
        self.assertEqual(
            Ecriture.objects.filter(
                journal__type_journal=Journal.Type.BANQUE,
                numero_piece=self.invoice_number,
            ).count(),
            1,
        )
        facture.refresh_from_db()
        self.assertEqual(facture.ecriture_id, response.data["id"])
        self.assertEqual(facture.mode_paiement, "Virement")

    def test_sale_scan_reuses_invoice_when_matching_virement_payment_remains(self):
        sale_journal = Journal.objects.create(
            entreprise=self.entreprise,
            annee=self.journal.annee,
            type_journal=Journal.Type.VENTE,
        )
        old_entry = Ecriture.objects.create(
            journal=sale_journal,
            date_ecriture=date(2026, 1, 15),
            numero_piece=self.invoice_number,
            source=Ecriture.Source.SCANNER,
        )
        facture = Facture.objects.create(
            entreprise=self.entreprise,
            client=self.accountant,
            numero_facture=self.invoice_number,
            date_facture=date(2026, 1, 15),
            montant_ttc=119,
            statut=Facture.Statut.VALIDE,
            ecriture=old_entry,
            mode_paiement="Virement",
            fournisseur_client="Client Test",
            type_facture="vente",
        )
        bank_journal = Journal.objects.create(
            entreprise=self.entreprise,
            annee=self.journal.annee,
            type_journal=Journal.Type.BANQUE,
        )
        payment_entry = Ecriture.objects.create(
            journal=bank_journal,
            date_ecriture=facture.date_facture,
            numero_piece=self.invoice_number,
            fournisseur_client=facture.fournisseur_client,
            source=Ecriture.Source.SCANNER,
            mode_paiement=facture.mode_paiement,
        )
        LigneEcriture.objects.create(
            ecriture=payment_entry,
            numero_compte="512000",
            montant_debit=119,
        )
        LigneEcriture.objects.create(
            ecriture=payment_entry,
            numero_compte="411000",
            montant_credit=119,
        )
        self.client.delete(f"/api/ecritures/{old_entry.id}/")

        payload = self._confirm_data()
        payload["data"].update({
            "journal": "Ventes",
            "fournisseur": "Client Test",
            "mode_paiement": "Virement",
        })

        def persist_sale_without_extra_payment(entreprise, data, source):
            return Ecriture.objects.create(
                journal=sale_journal,
                date_ecriture=date(2026, 1, 15),
                numero_piece=data.get("numero_facture", ""),
                fournisseur_client=data.get("fournisseur", ""),
                source=source,
                mode_paiement=data.get("mode_paiement", ""),
            )

        with patch(
            "core.views.persist_extraction",
            side_effect=persist_sale_without_extra_payment,
        ) as persist:
            response = self.client.post(self.confirm_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(persist.call_args.args[1]["mode_paiement"], "")
        self.assertEqual(Ecriture.objects.filter(pk=payment_entry.pk).count(), 1)
        self.assertEqual(
            Ecriture.objects.filter(
                journal__type_journal=Journal.Type.BANQUE,
                numero_piece=self.invoice_number,
            ).count(),
            1,
        )
        facture.refresh_from_db()
        self.assertEqual(facture.ecriture_id, response.data["id"])
        self.assertEqual(facture.type_facture, "vente")
        self.assertEqual(facture.mode_paiement, "Virement")

    def test_bank_mode_does_not_create_extra_bank_entry_for_invoice_payment(self):
        year = ExerciceAnnee.objects.get(entreprise=self.entreprise, annee=2026)
        data = {
            "numero_facture": self.invoice_number,
            "date_facture": "2026-01-15",
            "fournisseur": "Fournisseur Test",
            "montant_ht": 100,
            "tva_pourcentage": 19,
            "montant_tva": 19,
            "montant_ttc": 119,
            "journal": "Achats",
            "mode_paiement": "Virement",
            "confiance": 95,
            "lignes": [
                {"compte": "6011", "libelle": "Achats de marchandises", "debit": 100, "credit": 0},
                {"compte": "401000", "libelle": "Fournisseur Test", "debit": 0, "credit": 100},
            ],
        }

        created = persist_extraction(self.entreprise, data, source="scanner")

        self.assertEqual(created.journal.type_journal, Journal.Type.ACHAT)
        self.assertEqual(
            Ecriture.objects.filter(journal__entreprise=self.entreprise, journal__type_journal=Journal.Type.BANQUE).count(),
            0,
        )
        self.assertEqual(
            Ecriture.objects.filter(journal__entreprise=self.entreprise, journal__type_journal=Journal.Type.ACHAT).count(),
            1,
        )

    def test_bank_journal_api_returns_only_statement_entries(self):
        year = ExerciceAnnee.objects.get(entreprise=self.entreprise, annee=2026)
        bank_journal = Journal.objects.create(
            entreprise=self.entreprise,
            annee=year,
            type_journal=Journal.Type.BANQUE,
        )

        import_entry = Ecriture.objects.create(
            journal=bank_journal,
            date_ecriture=date(2026, 1, 15),
            numero_piece="RELEV-01",
            fournisseur_client="BNA",
            source=Ecriture.Source.IMPORT,
            mode_paiement="relevé bancaire",
        )
        LigneEcriture.objects.create(
            ecriture=import_entry,
            numero_compte="512000",
            libelle="Virement client",
            montant_debit=100,
            montant_credit=0,
        )
        LigneEcriture.objects.create(
            ecriture=import_entry,
            numero_compte="411000",
            libelle="Virement client",
            montant_debit=0,
            montant_credit=100,
        )

        payment_entry = Ecriture.objects.create(
            journal=bank_journal,
            date_ecriture=date(2026, 1, 16),
            numero_piece=self.invoice_number,
            fournisseur_client="Fournisseur Test",
            source=Ecriture.Source.SCANNER,
            mode_paiement="Virement",
        )
        LigneEcriture.objects.create(
            ecriture=payment_entry,
            numero_compte="401000",
            libelle="Règlement fournisseur Fournisseur Test",
            montant_debit=119,
            montant_credit=0,
        )
        LigneEcriture.objects.create(
            ecriture=payment_entry,
            numero_compte="512000",
            libelle="Règlement fournisseur Fournisseur Test",
            montant_debit=0,
            montant_credit=119,
        )

        response = self.client.get(
            f"/api/entreprises/{self.entreprise.id}/journaux/{bank_journal.id}/ecritures/"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item["id"] for item in response.data}
        self.assertIn(import_entry.id, returned_ids)
        self.assertNotIn(payment_entry.id, returned_ids)

    def test_active_invoice_is_still_rejected_as_duplicate(self):
        active_entry = self._create_entry(
            self.entreprise, self._confirm_data()["data"]
        )
        Facture.objects.create(
            entreprise=self.entreprise,
            client=self.accountant,
            numero_facture=self.invoice_number,
            statut=Facture.Statut.VALIDE,
            ecriture=active_entry,
        )

        with patch("core.views.persist_extraction") as persist:
            response = self.client.post(self.confirm_url, self._confirm_data(), format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        persist.assert_not_called()
        self.assertEqual(Ecriture.objects.count(), 1)

    def test_other_accountant_cannot_delete_or_create_for_company(self):
        entry = self._create_entry(self.entreprise, self._confirm_data()["data"])
        self.client.force_authenticate(self.other_accountant)

        delete_response = self.client.delete(f"/api/ecritures/{entry.id}/")
        create_response = self.client.post(
            "/api/factures/",
            {"entreprise": self.entreprise.id, "numero_facture": "FAC-FOREIGN"},
            format="json",
        )

        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(create_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Ecriture.objects.filter(pk=entry.pk).exists())
        self.assertFalse(
            Facture.objects.filter(
                entreprise=self.entreprise, numero_facture="FAC-FOREIGN"
            ).exists()
        )
