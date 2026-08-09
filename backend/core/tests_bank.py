from datetime import date
from django.test import TestCase
from core.models import Entreprise, Journal, Ecriture, LigneEcriture, ExerciceAnnee
from core.scanner import persist_extraction, WebhookError, check_bank_account_match
from django.contrib.auth import get_user_model

User = get_user_model()


class BankStatementTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="comptable", password="password", role="accountant")
        self.entreprise = Entreprise.objects.create(
            nom="SARL TEST ALGERIE",
            nif="123456789012345",
            nis="987654321098765",
            date_creation=date(2025, 1, 1),
            exercice_comptable="janvier-decembre",
            banque="BNA",
            numero_compte="002000123456789",
            rib="00200012345678901234",
            accountant=self.user,
        )
        self.exercice = ExerciceAnnee.objects.create(
            entreprise=self.entreprise,
            annee=2026,
            is_active=True
        )

    def test_bank_account_mismatch_raises_error(self):
        data = {
            "journal": "Banque",
            "date_facture": "15/01/2026",
            "numero_facture": "RELEV-001",
            "numero_compte_bancaire": "999999999999999",  # Wrong account
            "confiance": 95,
            "lignes": [
                {"libelle": "Virement Fournisseur", "debit": 5000, "credit": 0}
            ]
        }
        with self.assertRaises(WebhookError) as ctx:
            persist_extraction(self.entreprise, data, source="scanner")
        self.assertIn("ne correspond pas aux comptes bancaires", str(ctx.exception))

    def test_bank_account_match_and_line_by_line_processing(self):
        data = {
            "journal": "Banque",
            "date_facture": "15/01/2026",
            "numero_facture": "RELEV-2026-01",
            "numero_compte_bancaire": "002000123456789",  # Correct matching account
            "confiance": 95,
            "mode_paiement": "Virement",
            "lignes": [
                {
                    "date": "10/01/2026",
                    "libelle": "Virement Fournisseur CONDOR",
                    "tiers": "CONDOR ELECTRONICS",
                    "debit": 120000.0,
                    "credit": 0.0,
                },
                {
                    "date": "12/01/2026",
                    "libelle": "Remise Chèque Client SPA ALGER",
                    "tiers": "SPA ALGER",
                    "debit": 0.0,
                    "credit": 350000.0,
                },
                {
                    "date": "14/01/2026",
                    "libelle": "Frais de tenue de compte bancaire",
                    "debit": 2500.0,
                    "credit": 0.0,
                },
            ],
        }

        first_ecriture = persist_extraction(self.entreprise, data, source="scanner")
        self.assertIsNotNone(first_ecriture)

        # Check total generated ecritures in Banque journal
        journal_banque = Journal.objects.get(entreprise=self.entreprise, type_journal=Journal.Type.BANQUE)
        ecritures = Ecriture.objects.filter(journal=journal_banque).order_by("id")
        self.assertEqual(ecritures.count(), 3)

        # 1. Opération 1: Dépense Fournisseur 120000 DA
        ec1 = ecritures[0]
        lignes1 = list(ec1.lignes.all())
        self.assertEqual(len(lignes1), 2)
        # Débit 401xxx / Crédit 512000
        l_debit1 = [l for l in lignes1 if float(l.montant_debit) > 0][0]
        l_credit1 = [l for l in lignes1 if float(l.montant_credit) > 0][0]
        self.assertTrue(l_debit1.numero_compte.startswith("401"))
        self.assertEqual(float(l_debit1.montant_debit), 120000.0)
        self.assertEqual(l_credit1.numero_compte, "512000")
        self.assertEqual(float(l_credit1.montant_credit), 120000.0)

        # 2. Opération 2: Recette Client 350000 DA
        ec2 = ecritures[1]
        lignes2 = list(ec2.lignes.all())
        self.assertEqual(len(lignes2), 2)
        # Débit 512000 / Crédit 411xxx
        l_debit2 = [l for l in lignes2 if float(l.montant_debit) > 0][0]
        l_credit2 = [l for l in lignes2 if float(l.montant_credit) > 0][0]
        self.assertEqual(l_debit2.numero_compte, "512000")
        self.assertEqual(float(l_debit2.montant_debit), 350000.0)
        self.assertTrue(l_credit2.numero_compte.startswith("411"))
        self.assertEqual(float(l_credit2.montant_credit), 350000.0)

        # 3. Opération 3: Frais bancaires 2500 DA -> 627000
        ec3 = ecritures[2]
        lignes3 = list(ec3.lignes.all())
        self.assertEqual(len(lignes3), 2)
        l_debit3 = [l for l in lignes3 if float(l.montant_debit) > 0][0]
        l_credit3 = [l for l in lignes3 if float(l.montant_credit) > 0][0]
        self.assertEqual(l_debit3.numero_compte, "627000")
        self.assertEqual(float(l_debit3.montant_debit), 2500.0)
        self.assertEqual(l_credit3.numero_compte, "512000")
        self.assertEqual(float(l_credit3.montant_credit), 2500.0)

    def test_bank_statement_accepts_amount_field_and_sens(self):
        data = {
            "journal": "Banque",
            "date_facture": "16/01/2026",
            "numero_facture": "RELEV-2026-02",
            "numero_compte_bancaire": "002000123456789",
            "confiance": 95,
            "mode_paiement": "Virement",
            "lignes": [
                {
                    "date": "15/01/2026",
                    "libelle": "Paiement fournisseur",
                    "tiers": "CONDOR ELECTRONICS",
                    "montant": 120000.0,
                    "sens": "debit",
                },
                {
                    "date": "16/01/2026",
                    "libelle": "Encaissement client",
                    "tiers": "SPA ALGER",
                    "montant": 350000.0,
                    "sens": "credit",
                },
            ],
        }

        ecriture = persist_extraction(self.entreprise, data, source="scanner")
        self.assertIsNotNone(ecriture)

        journal_banque = Journal.objects.get(entreprise=self.entreprise, type_journal=Journal.Type.BANQUE)
        ecritures = Ecriture.objects.filter(journal=journal_banque).order_by("id")
        self.assertEqual(ecritures.count(), 2)

    def test_cheque_return_client_uses_client_account(self):
        data = {
            "journal": "Banque",
            "date_facture": "17/01/2026",
            "numero_facture": "RELEV-2026-03",
            "numero_compte_bancaire": "002000123456789",
            "confiance": 95,
            "mode_paiement": "Chèque",
            "lignes": [
                {
                    "date": "17/01/2026",
                    "libelle": "Retour de chèque client",
                    "tiers": "SPA ALGER",
                    "debit": 65000.0,
                    "credit": 0.0,
                }
            ],
        }

        persist_extraction(self.entreprise, data, source="scanner")
        journal_banque = Journal.objects.get(entreprise=self.entreprise, type_journal=Journal.Type.BANQUE)
        ecriture = Ecriture.objects.filter(journal=journal_banque).latest("id")
        ligne_compte = ecriture.lignes.filter(montant_debit__gt=0).first()
        self.assertTrue(ligne_compte.numero_compte.startswith("411"))

    def test_bank_statement_without_invoice_number_gets_default_reference(self):
        data = {
            "journal": "Banque",
            "date_facture": "18/01/2026",
            "numero_compte_bancaire": "002000123456789",
            "confiance": 95,
            "mode_paiement": "Virement",
            "lignes": [
                {
                    "date": "18/01/2026",
                    "libelle": "Encaissement client",
                    "tiers": "SPA ALGER",
                    "montant": 25000.0,
                    "sens": "credit",
                }
            ],
        }

        ecriture = persist_extraction(self.entreprise, data, source="scanner")
        self.assertIsNotNone(ecriture)
        self.assertTrue(ecriture.numero_piece.startswith("RELEV-"))
