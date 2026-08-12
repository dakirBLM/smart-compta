from datetime import date
from django.test import TestCase
from core.models import Entreprise, Journal, Ecriture, LigneEcriture, ExerciceAnnee
from core.bank_statements import (
    import_bank_statement, BankStatementError, validate_statement_account,
    classify_operation, BANK_ACCOUNT, HOLDING_ACCOUNT,
)
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

    def test_duplicate_sort_chq_raises_error(self):
        """Pour SORT CHQ: Vérifier qu'une opération identique (date, ref, label, montant) est rejetée."""
        # Créer une première opération SORT CHQ
        data1 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "10/01/2026",
                    "libelle": "SORT CHQ 00123",
                    "reference": "CHQ-1001",
                    "sens": "credit",
                    "montant": 120000.0,
                    "compte_contrepartie": "401000",
                }
            ]
        }
        import_bank_statement(self.entreprise, data1)
        
        # Essayer d'importer la même SORT CHQ à nouveau (tous les 4 critères identiques)
        data2 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "10/01/2026",
                    "libelle": "SORT CHQ 00123",
                    "reference": "CHQ-1001",
                    "sens": "credit",
                    "montant": 120000.0,
                    "compte_contrepartie": "401000",
                }
            ]
        }
        with self.assertRaises(BankStatementError) as ctx:
            import_bank_statement(self.entreprise, data2)
        self.assertIn("Doublon détecté", str(ctx.exception))

    def test_duplicate_non_sort_chq_raises_error(self):
        """Pour les opérations non-SORT CHQ: Vérifier que même numero_piece est rejeté."""
        # Créer une première opération NON-SORT CHQ
        data1 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "10/01/2026",
                    "libelle": "Virement Fournisseur CONDOR",
                    "reference": "VIR-2001",
                    "sens": "credit",
                    "montant": 120000.0,
                    "compte_contrepartie": "401000",
                }
            ]
        }
        import_bank_statement(self.entreprise, data1)
        
        # Essayer d'importer une autre opération avec le même numero_piece
        # Même si les autres détails diffèrent, le numero_piece dupliqué doit être rejeté
        data2 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "11/01/2026",  # Date différente
                    "libelle": "Autre Virement",  # Libellé différent
                    "reference": "VIR-2001",  # Même numero_piece
                    "sens": "credit",
                    "montant": 50000.0,  # Montant différent
                    "compte_contrepartie": "401000",
                }
            ]
        }
        with self.assertRaises(BankStatementError) as ctx:
            import_bank_statement(self.entreprise, data2)
        self.assertIn("existe déjà", str(ctx.exception))

    def test_sort_chq_different_amount_allowed(self):
        """Pour SORT CHQ: Vérifier qu'un montant différent est accepté même avec date et ref identiques."""
        data1 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "10/01/2026",
                    "libelle": "SORT CHQ 00456",
                    "reference": "CHQ-2001",
                    "sens": "credit",
                    "montant": 120000.0,
                    "compte_contrepartie": "401000",
                }
            ]
        }
        import_bank_statement(self.entreprise, data1)
        
        # Même date, référence et libellé, mais montant différent → doit être accepté
        data2 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "10/01/2026",
                    "libelle": "SORT CHQ 00456",
                    "reference": "CHQ-2001",
                    "sens": "credit",
                    "montant": 150000.0,  # Montant différent
                    "compte_contrepartie": "401000",
                }
            ]
        }
        entries = import_bank_statement(self.entreprise, data2)
        self.assertEqual(len(entries), 1)

    def test_sort_chq_different_date_allowed(self):
        """Pour SORT CHQ: Vérifier qu'une date différente est acceptée même avec ref et montant identiques."""
        data1 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "10/01/2026",
                    "libelle": "SORT CHQ 00789",
                    "reference": "CHQ-3001",
                    "sens": "credit",
                    "montant": 120000.0,
                    "compte_contrepartie": "401000",
                }
            ]
        }
        import_bank_statement(self.entreprise, data1)
        
        # Même référence, libellé et montant, mais date différente → doit être accepté
        data2 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "11/01/2026",  # Date différente
                    "libelle": "SORT CHQ 00789",
                    "reference": "CHQ-3001",
                    "sens": "credit",
                    "montant": 120000.0,
                    "compte_contrepartie": "401000",
                }
            ]
        }
        entries = import_bank_statement(self.entreprise, data2)
        self.assertEqual(len(entries), 1)

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
        # La ligne de débit doit être 512000 (compte d'attente en crédit, banque en débit)
        l_debit = ec.lignes.filter(montant_debit__gt=0).first()
        self.assertEqual(l_debit.numero_compte, "512000")


class ClassifyOperationTestCase(TestCase):
    """Tests unitaires de classify_operation() pour chaque règle comptable."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_user(username="cpt2", password="pw", role="accountant")
        self.entreprise = None  # pas nécessaire pour les tests sans tiers

    # ── Règle 1 : VERSEMENT → Débit 512000 / Crédit 581000 ──────────────────
    def test_versement(self):
        d, c = classify_operation("VERSEMENT ESPECES", "debit", "", "")
        self.assertEqual(d, BANK_ACCOUNT)   # 512000
        self.assertEqual(c, "581000")

    def test_versement_credit_direction_ignored(self):
        """La direction n'a pas d'importance : VERSEMENT impose toujours 512/581."""
        d, c = classify_operation("versement", "credit", "", "")
        self.assertEqual(d, BANK_ACCOUNT)
        self.assertEqual(c, "581000")

    # ── Règle 2 : CHQ RETOUR → Débit 401000 / Crédit 512000 ──────────────────
    def test_chq_retour(self):
        d, c = classify_operation("CHQ RETOUR 000123", "debit", "", "")
        self.assertEqual(d, "401000")
        self.assertEqual(c, BANK_ACCOUNT)   # 512000

    def test_cheque_retour_alias(self):
        d, c = classify_operation("CHEQUE RETOUR IMPAYE", "credit", "", "")
        self.assertEqual(d, "401000")
        self.assertEqual(c, BANK_ACCOUNT)

    # ── Règle SORT CHQ : analyse du contexte (jamais 401000 automatique) ───────
    def test_sort_chq_frais_context(self):
        """SORT CHQ avec contexte de frais → Débit 627000 / Crédit 512000."""
        d, c = classify_operation("SORT CHQ FRAIS TENUE COMPTE", "credit", "", "")
        self.assertEqual(d, "627000")
        self.assertEqual(c, BANK_ACCOUNT)

    def test_sort_chq_client_context(self):
        """SORT CHQ avec contexte client → Débit 512000 / Crédit 411000."""
        d, c = classify_operation("SORT CHQ ENCAISSEMENT CLIENT", "debit", "", "")
        self.assertEqual(d, BANK_ACCOUNT)
        self.assertEqual(c, "411000")

    def test_sort_chq_fournisseur_explicite(self):
        """SORT CHQ avec fournisseur explicite dans tiers → Débit 401000 / Crédit 512000."""
        d, c = classify_operation("SORT CHQ 00056", "credit", "", tiers="CONDOR ELECTRONICS")
        self.assertEqual(d, "401000")
        self.assertEqual(c, BANK_ACCOUNT)

    def test_sort_chq_sans_contexte_holding(self):
        """SORT CHQ sans contexte ni tiers → Ne jamais mettre 401000 automatiquement → 471000."""
        d, c = classify_operation("SORT CHQ 00056", "credit", "", "")
        self.assertEqual(d, HOLDING_ACCOUNT)  # 471000
        self.assertEqual(c, BANK_ACCOUNT)

    def test_virement_fournisseur_keyword(self):
        d, c = classify_operation("VIREMENT FOURNISSEUR SAMSUNG", "credit", "", "")
        self.assertEqual(d, "401000")
        self.assertEqual(c, BANK_ACCOUNT)

    # ── Règle 4 : Encaissement client → Débit 512000 / Crédit 411xxx ──────────
    def test_encaissement_client(self):
        d, c = classify_operation("ENCAISSEMENT VIR CLIENT", "debit", "", "")
        self.assertEqual(d, BANK_ACCOUNT)
        self.assertEqual(c, "411000")

    def test_remise_cheque_accent(self):
        """Le libellé avec accents doit être normalisé avant comparaison."""
        d, c = classify_operation("Rem\u00eese Ch\u00e8que Client SPA", "debit", "", "")
        # après normalisation : REMISE CHEQUE CLIENT SPA → règle 4
        self.assertEqual(d, BANK_ACCOUNT)
        self.assertEqual(c, "411000")

    # ── Règle 5 : Frais bancaires → Débit 627000 / Crédit 512000 ──────────────
    def test_frais_bancaires(self):
        d, c = classify_operation("Frais de tenue de compte", "credit", "", "")
        self.assertEqual(d, "627000")
        self.assertEqual(c, BANK_ACCOUNT)

    def test_commission_bancaire(self):
        d, c = classify_operation("COMMISSION SUR VIREMENT", "credit", "", "")
        self.assertEqual(d, "627000")
        self.assertEqual(c, BANK_ACCOUNT)

    # ── Règles 6-7 : Contrepartie IA 401/411 ───────────────────────────────────
    def test_ia_counterpart_401(self):
        d, c = classify_operation("Paiement", "credit", "401000", "")
        self.assertEqual(d, "401000")
        self.assertEqual(c, BANK_ACCOUNT)

    def test_ia_counterpart_411(self):
        d, c = classify_operation("Virement entrant", "debit", "411000", "")
        self.assertEqual(d, BANK_ACCOUNT)
        self.assertEqual(c, "411000")

    # ── Règles 8-9 : Contrepartie IA autre compte valide ───────────────────────
    def test_ia_counterpart_autre_sortie(self):
        """Sortie bancaire avec contrepartie inconnue → (contrepartie, 512000)."""
        d, c = classify_operation("Opération diverse", "credit", "658000", "")
        self.assertEqual(d, "658000")
        self.assertEqual(c, BANK_ACCOUNT)

    def test_ia_counterpart_autre_entree(self):
        """Entrée bancaire avec contrepartie inconnue → (512000, contrepartie)."""
        d, c = classify_operation("Opération diverse", "debit", "747000", "")
        self.assertEqual(d, BANK_ACCOUNT)
        self.assertEqual(c, "747000")

    # ── Règle 12 : Fallback compte d'attente ───────────────────────────────────
    def test_fallback_sortie_holding(self):
        """Libellé inconnu + sortie + sans tiers → (HOLDING, 512000)."""
        d, c = classify_operation("Virement indéterminé", "credit", "", "")
        self.assertEqual(d, HOLDING_ACCOUNT)   # 471000
        self.assertEqual(c, BANK_ACCOUNT)

    def test_fallback_entree_holding(self):
        """Libellé inconnu + entrée + sans tiers → (512000, HOLDING)."""
        d, c = classify_operation("Virement indéterminé", "debit", "", "")
        self.assertEqual(d, BANK_ACCOUNT)
        self.assertEqual(c, HOLDING_ACCOUNT)   # 471000


class BankStatementIntegrationRulesTestCase(TestCase):
    """Tests d'intégration complets : import + vérification Débit/Crédit en base."""

    def setUp(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        self.user = User.objects.create_user(username="cpt3", password="pw", role="accountant")
        self.entreprise = Entreprise.objects.create(
            nom="EURL INTEGRATION",
            nif="111111111111111",
            nis="222222222222222",
            date_creation=date(2025, 1, 1),
            exercice_comptable="janvier-decembre",
            banque="CPA",
            numero_compte="002000999999999",
            rib="00200099999999901234",
            accountant=self.user,
        )
        ExerciceAnnee.objects.create(entreprise=self.entreprise, annee=2026, is_active=True)

    def _import(self, libelle, sens, montant, compte_contrepartie="", tiers=""):
        data = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": libelle,
                "sens": sens,
                "montant": montant,
                "compte_contrepartie": compte_contrepartie,
                "tiers": tiers,
            }],
        }
        entries = import_bank_statement(self.entreprise, data)
        ec = entries[0]
        l_d = ec.lignes.filter(montant_debit__gt=0).first()
        l_c = ec.lignes.filter(montant_credit__gt=0).first()
        return l_d.numero_compte, l_c.numero_compte

    def test_integration_versement(self):
        d, c = self._import("VERSEMENT ESPECES AU GUICHET", "debit", 50000)
        self.assertEqual(d, "512000")
        self.assertEqual(c, "581000")

    def test_integration_sort_chq_fournisseur(self):
        d, c = self._import("SORT CHQ 00089 FOURNISSEUR", "credit", 30000, tiers="FOURNISSEUR ABC")
        self.assertTrue(d.startswith("401"))
        self.assertEqual(c, "512000")

    def test_integration_encaissement_client(self):
        d, c = self._import("REMISE CHEQUE CLIENT DURAND", "debit", 80000, tiers="CLIENT DURAND")
        self.assertEqual(d, "512000")
        self.assertTrue(c.startswith("411"))

    def test_integration_frais_bancaires(self):
        d, c = self._import("COMMISSION SUR VIREMENT EMIS", "credit", 500)
        self.assertEqual(d, "627000")
        self.assertEqual(c, "512000")

    def test_integration_unknown_sortie_holding(self):
        d, c = self._import("OP DIVERSE NON IDENTIFIEE", "credit", 1000)
        self.assertEqual(d, HOLDING_ACCOUNT)
        self.assertEqual(c, "512000")

    def test_integration_unknown_entree_holding(self):
        d, c = self._import("OP DIVERSE NON IDENTIFIEE", "debit", 1000)
        self.assertEqual(d, "512000")
        self.assertEqual(c, HOLDING_ACCOUNT)

    def test_duplicate_bank_operation_all_four_identical_raises_error(self):
        """Si la date, la référence, le libellé et le montant sont identiques, lever une erreur."""
        data_first = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": "VIREMENT RECU",
                "sens": "debit",
                "montant": 15000,
                "reference": "REF123",
            }],
        }
        # Premier import -> succès
        import_bank_statement(self.entreprise, data_first)

        # Deuxième import identique -> erreur de doublon
        with self.assertRaises(BankStatementError) as ctx:
            import_bank_statement(self.entreprise, data_first)
        self.assertIn("existe déjà", str(ctx.exception))

    def test_duplicate_bank_operation_different_date_succeeds(self):
        """Si la date est différente, ce n'est pas un doublon et l'import réussit."""
        data1 = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": "VIREMENT RECU",
                "sens": "debit",
                "montant": 15000,
                "reference": "REF123",
            }],
        }
        data2 = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "21/01/2026", # Différente date
                "libelle": "VIREMENT RECU",
                "sens": "debit",
                "montant": 15000,
                "reference": "REF123",
            }],
        }
        import_bank_statement(self.entreprise, data1)
        # Ne doit pas lever d'erreur
        import_bank_statement(self.entreprise, data2)

    def test_duplicate_bank_operation_different_reference_succeeds(self):
        """Si la référence est différente, ce n'est pas un doublon et l'import réussit."""
        data1 = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": "VIREMENT RECU",
                "sens": "debit",
                "montant": 15000,
                "reference": "REF123",
            }],
        }
        data2 = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": "VIREMENT RECU",
                "sens": "debit",
                "montant": 15000,
                "reference": "REF456", # Différente référence
            }],
        }
        import_bank_statement(self.entreprise, data1)
        # Ne doit pas lever d'erreur
        import_bank_statement(self.entreprise, data2)

    def test_duplicate_bank_operation_different_libelle_succeeds(self):
        """Si le libellé est différent, ce n'est pas un doublon et l'import réussit."""
        data1 = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": "VIREMENT RECU",
                "sens": "debit",
                "montant": 15000,
                "reference": "REF123",
            }],
        }
        data2 = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": "AUTRE VIREMENT RECU", # Différent libellé
                "sens": "debit",
                "montant": 15000,
                "reference": "REF123",
            }],
        }
        import_bank_statement(self.entreprise, data1)
        # Ne doit pas lever d'erreur
        import_bank_statement(self.entreprise, data2)

    def test_duplicate_bank_operation_different_amount_succeeds(self):
        """Si le montant est différent, ce n'est pas un doublon et l'import réussit."""
        data1 = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": "VIREMENT RECU",
                "sens": "debit",
                "montant": 15000,
                "reference": "REF123",
            }],
        }
        data2 = {
            "numero_compte": "002000999999999",
            "lignes": [{
                "date": "20/01/2026",
                "libelle": "VIREMENT RECU",
                "sens": "debit",
                "montant": 25000, # Différent montant
                "reference": "REF123",
            }],
        }
        import_bank_statement(self.entreprise, data1)
        # Ne doit pas lever d'erreur
        import_bank_statement(self.entreprise, data2)

