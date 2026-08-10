from datetime import date
from django.test import TestCase
from core.models import Entreprise, Journal, Ecriture, LigneEcriture, ExerciceAnnee
from core.bank_statements import import_bank_statement, BankStatementError, validate_statement_account
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
            "numero_compte": "999999999999999",  # Wrong account
            "lignes": [
                {
                    "date": "15/01/2026",
                    "libelle": "Virement Fournisseur",
                    "sens": "credit",
                    "montant": 5000,
                    "compte_contrepartie": "401000",
                }
            ]
        }
        with self.assertRaises(BankStatementError) as ctx:
            import_bank_statement(self.entreprise, data)
        self.assertIn("ne correspond pas au compte bancaire", str(ctx.exception))

    def test_bank_account_match_and_line_by_line_processing(self):
        data = {
            "numero_compte": "002000123456789",  # Correct matching account
            "lignes": [
                {
                    "date": "10/01/2026",
                    "libelle": "Virement Fournisseur CONDOR",
                    "reference": "CHQ-1001",
                    "sens": "credit",  # décaissement : banque créditée
                    "montant": 120000.0,
                    "compte_contrepartie": "401000",
                    "tiers": "CONDOR ELECTRONICS",
                    "confiance": 95,
                },
                {
                    "date": "12/01/2026",
                    "libelle": "Remise Chèque Client SPA ALGER",
                    "reference": "VIR-2002",
                    "sens": "debit",  # encaissement : banque débitée
                    "montant": 350000.0,
                    "compte_contrepartie": "411000",
                    "tiers": "SPA ALGER",
                    "confiance": 95,
                },
                {
                    "date": "14/01/2026",
                    "libelle": "Frais de tenue de compte bancaire",
                    "reference": "",
                    "sens": "credit",  # décaissement : banque créditée
                    "montant": 2500.0,
                    "compte_contrepartie": "627000",
                    "tiers": "",
                    "confiance": 90,
                },
            ],
        }

        created = import_bank_statement(self.entreprise, data)
        self.assertEqual(len(created), 3)

        # Check total generated ecritures in Banque journal
        journal_banque = Journal.objects.get(entreprise=self.entreprise, type_journal=Journal.Type.BANQUE)
        ecritures = Ecriture.objects.filter(journal=journal_banque).order_by("id")
        self.assertEqual(ecritures.count(), 3)

        # 1. Opération 1: Dépense Fournisseur 120000 DA (décaissement -> crédit 512000, débit 401xxx)
        ec1 = ecritures[0]
        self.assertEqual(ec1.statut, Ecriture.Statut.VALIDE)
        lignes1 = list(ec1.lignes.all())
        self.assertEqual(len(lignes1), 2)
        l_debit1 = [l for l in lignes1 if float(l.montant_debit) > 0][0]
        l_credit1 = [l for l in lignes1 if float(l.montant_credit) > 0][0]
        self.assertTrue(l_debit1.numero_compte.startswith("401"))
        self.assertEqual(float(l_debit1.montant_debit), 120000.0)
        self.assertEqual(l_credit1.numero_compte, "512000")
        self.assertEqual(float(l_credit1.montant_credit), 120000.0)

        # 2. Opération 2: Recette Client 350000 DA (encaissement -> débit 512000, crédit 411xxx)
        ec2 = ecritures[1]
        self.assertEqual(ec2.statut, Ecriture.Statut.VALIDE)
        lignes2 = list(ec2.lignes.all())
        self.assertEqual(len(lignes2), 2)
        l_debit2 = [l for l in lignes2 if float(l.montant_debit) > 0][0]
        l_credit2 = [l for l in lignes2 if float(l.montant_credit) > 0][0]
        self.assertEqual(l_debit2.numero_compte, "512000")
        self.assertEqual(float(l_debit2.montant_debit), 350000.0)
        self.assertTrue(l_credit2.numero_compte.startswith("411"))
        self.assertEqual(float(l_credit2.montant_credit), 350000.0)

        # 3. Opération 3: Frais bancaires 2500 DA -> 627000 (décaissement -> débit 627000, crédit 512000)
        ec3 = ecritures[2]
        self.assertEqual(ec3.statut, Ecriture.Statut.VALIDE)
        lignes3 = list(ec3.lignes.all())
        self.assertEqual(len(lignes3), 2)
        l_debit3 = [l for l in lignes3 if float(l.montant_debit) > 0][0]
        l_credit3 = [l for l in lignes3 if float(l.montant_credit) > 0][0]
        self.assertEqual(l_debit3.numero_compte, "627000")
        self.assertEqual(float(l_debit3.montant_debit), 2500.0)
        self.assertEqual(l_credit3.numero_compte, "512000")
        self.assertEqual(float(l_credit3.montant_credit), 2500.0)

    def test_bank_statement_accepts_two_amount_columns(self):
        data = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "15/01/2026",
                    "libelle": "Paiement fournisseur",
                    "tiers": "CONDOR ELECTRONICS",
                    "debit": "0",
                    "credit": "120000.0",
                    "compte_contrepartie": "401000",
                },
                {
                    "date": "16/01/2026",
                    "libelle": "Encaissement client",
                    "tiers": "SPA ALGER",
                    "debit": "350000.0",
                    "credit": "0",
                    "compte_contrepartie": "411000",
                },
            ],
        }

        entries = import_bank_statement(self.entreprise, data)
        self.assertEqual(len(entries), 2)

        journal_banque = Journal.objects.get(entreprise=self.entreprise, type_journal=Journal.Type.BANQUE)
        ecritures = Ecriture.objects.filter(journal=journal_banque).order_by("id")
        self.assertEqual(ecritures.count(), 2)

    def test_missing_counterpart_uses_holding_account(self):
        data = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "17/01/2026",
                    "libelle": "Virement indéterminé",
                    "sens": "debit",
                    "montant": 65000.0,
                    "compte_contrepartie": "",  # Empty counterpart
                }
            ],
        }

        entries = import_bank_statement(self.entreprise, data)
        self.assertEqual(len(entries), 1)
        ec = entries[0]
        l_credit = ec.lignes.filter(montant_credit__gt=0).first()
        self.assertEqual(l_credit.numero_compte, "471000")
