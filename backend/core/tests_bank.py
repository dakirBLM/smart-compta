from datetime import date
from unittest.mock import patch
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from core.bank_test_utils import make_bank
from core.models import (
    BankAccount,
    BankStatement,
    Entreprise,
    ExerciceAnnee,
    Ecriture,
    Journal,
    LigneEcriture,
    SCFAccount,
)
from core.bank_statements import (
    import_bank_statement as _import_bank_statement, BankStatementError,
    BankStatementRejected, preview_entries, resolve_statement_bank,
    validate_statement_identity,
    classify_operation, BANK_ACCOUNT, HOLDING_ACCOUNT,
)
from django.contrib.auth import get_user_model

User = get_user_model()


def import_bank_statement(entreprise, data):
    """Keep accounting-rule fixtures focused on transaction classification."""
    payload = dict(data)
    first_bank = entreprise.bank_accounts.order_by("id").first()
    payload.setdefault("nom_banque", first_bank.bank_name if first_bank else "")
    payload.setdefault("nom_entreprise", entreprise.nom)
    return _import_bank_statement(entreprise, payload)


class BankAccountResolverTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="bank-resolver", password="password", role="accountant"
        )
        self.entreprise = Entreprise.objects.create(
            nom="Resolver Company",
            date_creation=date(2026, 1, 1),
            exercice_comptable="2026",
            accountant=self.user,
        )

    def add_bank(self, bank_name, account_number, rib):
        index = self.entreprise.bank_accounts.count() + 1
        scf_account = SCFAccount.objects.create(
            entreprise=self.entreprise,
            numero_compte=f"512{index:03d}",
            libelle=f"BANQUE {bank_name}",
            classe=5,
        )
        return BankAccount.objects.create(
            entreprise=self.entreprise,
            bank_name=bank_name,
            account_number=account_number,
            rib=rib,
            scf_account=scf_account,
        )

    def set_legacy_banks(self, first=("", "", ""), second=("", "", "")):
        (
            self.entreprise.banque,
            self.entreprise.numero_compte,
            self.entreprise.rib,
        ) = first
        (
            self.entreprise.banque2,
            self.entreprise.numero_compte2,
            self.entreprise.rib2,
        ) = second
        self.entreprise.save(update_fields=[
            "banque", "numero_compte", "rib",
            "banque2", "numero_compte2", "rib2",
        ])

    def test_one_bank_without_identity_is_selected_with_missing_status(self):
        bank = self.add_bank("BNA", "11112222", "001111222233")

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "missing")
        self.assertEqual(result["bank"]["bank_account"], bank)

    def test_one_bank_matches_name_account_number_and_rib(self):
        bank = self.add_bank("BNA", "11112222", "001111222233")

        result = resolve_statement_bank(self.entreprise, {
            "nom_banque": "Banque Nationale d'Algerie",
            "numero_compte_bancaire": "1111-2222",
            "rib": "0011 1122 2233",
        })

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_account"], bank)

    def test_two_banks_are_identified_separately_by_name(self):
        first = self.add_bank("BNA", "11112222", "001111222233")
        second = self.add_bank("CPA", "33334444", "003333444455")

        first_result = resolve_statement_bank(self.entreprise, {"bank": "BNA"})
        second_result = resolve_statement_bank(self.entreprise, {"nom_banque": "CPA"})

        self.assertEqual(first_result["bank"]["bank_account"], first)
        self.assertEqual(second_result["bank"]["bank_account"], second)

    def test_account_number_disambiguates_accounts_with_same_bank_name(self):
        self.add_bank("BNA", "11112222", "001111222233")
        second = self.add_bank("BNA", "33334444", "003333444455")

        result = resolve_statement_bank(self.entreprise, {
            "nom_banque": "BNA",
            "numero_compte": second.account_number,
        })

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_account"], second)

    def test_two_banks_are_identified_separately_by_account_number(self):
        first = self.add_bank("BNA", "11112222", "001111222233")
        second = self.add_bank("CPA", "33334444", "003333444455")

        first_result = resolve_statement_bank(
            self.entreprise, {"numero_compte": "11112222"}
        )
        second_result = resolve_statement_bank(
            self.entreprise, {"account_number": "33334444"}
        )

        self.assertEqual(first_result["bank"]["bank_account"], first)
        self.assertEqual(second_result["bank"]["bank_account"], second)

    def test_two_banks_are_identified_separately_by_rib(self):
        first = self.add_bank("BNA", "11112222", "001111222233")
        second = self.add_bank("CPA", "33334444", "003333444455")

        first_result = resolve_statement_bank(self.entreprise, {"rib": "001111222233"})
        second_result = resolve_statement_bank(self.entreprise, {"rib": "003333444455"})

        self.assertEqual(first_result["bank"]["bank_account"], first)
        self.assertEqual(second_result["bank"]["bank_account"], second)

    def test_three_banks_can_match_the_third_bank(self):
        self.add_bank("BNA", "11112222", "001111222233")
        self.add_bank("CPA", "33334444", "003333444455")
        third = self.add_bank("Bank Three", "55556666", "005555666677")

        result = resolve_statement_bank(self.entreprise, {"bank_name": "Bank Three"})

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_account"], third)

    def test_five_banks_can_match_the_fifth_bank(self):
        for index in range(1, 5):
            self.add_bank(
                f"Bank {index}", f"{index}1112222", f"00{index}111222233"
            )
        fifth = self.add_bank("Bank Five", "51112222", "005111222233")

        result = resolve_statement_bank(self.entreprise, {"bank_name": "Bank Five"})

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_account"], fifth)

    def test_unique_partial_account_number_matches(self):
        bank = self.add_bank("BNA", "11112222", "001111222233")
        self.add_bank("CPA", "33334444", "003333444455")

        result = resolve_statement_bank(self.entreprise, {"numero_compte": "1122"})

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_account"], bank)

    def test_unique_partial_rib_matches(self):
        bank = self.add_bank("BNA", "11112222", "001111222233")
        self.add_bank("CPA", "33334444", "003333444455")

        result = resolve_statement_bank(self.entreprise, {"rib": "112222"})

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_account"], bank)

    def test_partial_identifier_matching_multiple_banks_is_ambiguous(self):
        self.add_bank("BNA", "123456", "001111222233")
        self.add_bank("CPA", "99123", "003333444455")

        result = resolve_statement_bank(self.entreprise, {"numero_compte": "123"})

        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)

    def test_name_and_account_number_identifying_different_banks_conflict(self):
        first = self.add_bank("BNA", "11112222", "001111222233")
        second = self.add_bank("CPA", "33334444", "003333444455")

        result = resolve_statement_bank(self.entreprise, {
            "nom_banque": first.bank_name,
            "numero_compte": second.account_number,
        })

        self.assertEqual(result["status"], "conflict")
        self.assertEqual(
            {candidate["bank_account"] for candidate in result["candidates"]},
            {first, second},
        )

    def test_conflicting_bank_name_aliases_conflict(self):
        self.add_bank("BNA", "11112222", "001111222233")
        self.add_bank("CPA", "33334444", "003333444455")

        result = resolve_statement_bank(self.entreprise, {
            "nom_banque": "BNA",
            "bank_name": "CPA",
        })

        self.assertEqual(result["status"], "conflict")

    def test_conflicting_account_number_aliases_conflict(self):
        self.add_bank("BNA", "11112222", "001111222233")
        self.add_bank("CPA", "33334444", "003333444455")

        result = resolve_statement_bank(self.entreprise, {
            "numero_compte_bancaire": "11112222",
            "account_number": "33334444",
        })

        self.assertEqual(result["status"], "conflict")

    def test_conflicting_rib_aliases_conflict(self):
        self.add_bank("BNA", "11112222", "001111222233")
        self.add_bank("CPA", "33334444", "003333444455")

        result = resolve_statement_bank(self.entreprise, {
            "rib": "001111222233",
            "bank_rib": "003333444455",
        })

        self.assertEqual(result["status"], "conflict")

    def test_equivalent_identifier_aliases_preserve_matching(self):
        bank = self.add_bank("BNA", "11112222", "001111222233")

        result = resolve_statement_bank(self.entreprise, {
            "nom_banque": "BNA",
            "bank_name": "Banque Nationale d'Algerie",
            "numero_compte_bancaire": "1111-2222",
            "account_number": "11112222",
            "rib": "0011 1122 2233",
            "bank_rib": "001111222233",
        })

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_account"], bank)

    def test_supplied_identity_with_no_matching_bank_is_not_found(self):
        self.add_bank("BNA", "11112222", "001111222233")

        result = resolve_statement_bank(self.entreprise, {"nom_banque": "CPA"})

        self.assertEqual(result["status"], "not_found")
        self.assertIsNone(result["bank"])

    def test_account_number_without_alphanumeric_characters_is_not_found(self):
        self.add_bank("BNA", "11112222", "001111222233")

        result = resolve_statement_bank(self.entreprise, {"numero_compte": "---"})

        self.assertEqual(result["status"], "not_found")

    def test_legacy_only_company_with_one_bank_is_selected_without_identity(self):
        self.entreprise.banque = "BNA"
        self.entreprise.numero_compte = "11112222"
        self.entreprise.rib = "001111222233"
        self.entreprise.save(update_fields=["banque", "numero_compte", "rib"])

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "missing")
        self.assertIsNone(result["bank"]["bank_account"])
        self.assertEqual(result["bank"]["bank_name"], "BNA")

    def test_legacy_only_company_with_two_banks_matches_second_by_rib(self):
        self.entreprise.banque = "BNA"
        self.entreprise.numero_compte = "11112222"
        self.entreprise.rib = "001111222233"
        self.entreprise.banque2 = "CPA"
        self.entreprise.numero_compte2 = "33334444"
        self.entreprise.rib2 = "003333444455"
        self.entreprise.save(update_fields=[
            "banque", "numero_compte", "rib",
            "banque2", "numero_compte2", "rib2",
        ])

        result = resolve_statement_bank(self.entreprise, {"rib": "003333444455"})

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_name"], "CPA")
        self.assertIsNone(result["bank"]["bank_account"])

    def test_migrated_legacy_banks_are_not_duplicated_as_candidates(self):
        self.set_legacy_banks(
            ("BNA", "11112222", "001111222233"),
            ("CPA", "33334444", "003333444455"),
        )
        self.add_bank("BNA", "11112222", "001111222233")
        self.add_bank("CPA", "33334444", "003333444455")

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)
        self.assertTrue(all(
            candidate["bank_account"] is not None
            for candidate in result["candidates"]
        ))

    def test_migrated_bank_with_missing_legacy_rib_is_deduplicated(self):
        bank = self.add_bank("BNA", "11112222", "001111222233")
        self.set_legacy_banks(("BNA", "11112222", ""))

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "missing")
        self.assertEqual(result["bank"]["bank_account"], bank)

    def test_migrated_bank_with_missing_legacy_account_number_is_deduplicated(self):
        bank = self.add_bank("BNA", "11112222", "001111222233")
        self.set_legacy_banks(("BNA", "", "001111222233"))

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "missing")
        self.assertEqual(result["bank"]["bank_account"], bank)

    def test_deduplicated_candidate_keeps_legacy_bank_name_when_model_name_is_blank(self):
        bank = self.add_bank("", "11112222", "001111222233")
        self.set_legacy_banks(("BNA", "11112222", "001111222233"))

        result = resolve_statement_bank(
            self.entreprise, {"numero_compte": "11112222"}
        )

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["bank"]["bank_account"], bank)
        self.assertEqual(result["bank"]["bank_name"], "BNA")

    def test_conflicting_account_numbers_prevent_deduplication(self):
        self.add_bank("BNA", "11112222", "001111222233")
        self.set_legacy_banks(("BNA", "99999999", "001111222233"))

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)

    def test_conflicting_ribs_prevent_deduplication(self):
        self.add_bank("BNA", "11112222", "001111222233")
        self.set_legacy_banks(("BNA", "11112222", "009999999999"))

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)

    def test_same_bank_name_with_different_accounts_is_not_deduplicated(self):
        self.add_bank("BNA", "11112222", "001111222233")
        self.set_legacy_banks(("BNA", "33334444", "003333444455"))

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)

    def test_conflicting_bank_names_prevent_deduplication(self):
        self.add_bank("BNA", "11112222", "001111222233")
        self.set_legacy_banks(("CPA", "11112222", "001111222233"))

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)

    def test_one_bank_account_cannot_represent_both_legacy_slots(self):
        bank = self.add_bank("BNA", "11112222", "001111222233")
        slot = ("BNA", "11112222", "001111222233")
        self.set_legacy_banks(slot, slot)

        result = resolve_statement_bank(self.entreprise, {})

        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)
        self.assertEqual(
            sum(candidate["bank_account"] == bank for candidate in result["candidates"]),
            1,
        )
        self.assertEqual(
            sum(candidate["bank_account"] is None for candidate in result["candidates"]),
            1,
        )

    def test_company_without_configured_banks_returns_no_banks(self):
        result = resolve_statement_bank(self.entreprise, {"nom_banque": "BNA"})

        self.assertEqual(result["status"], "no_banks")
        self.assertIsNone(result["bank"])
        self.assertEqual(result["candidates"], [])


class BankStatementTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="comptable", password="password", role="accountant")
        self.entreprise = Entreprise.objects.create(
            nom="SARL TEST ALGERIE",
            nif="123456789012345",
            nis="987654321098765",
            date_creation=date(2025, 1, 1),
            exercice_comptable="janvier-decembre",
            accountant=self.user,
        )
        self.bank = make_bank(
            self.entreprise, "BNA", "002000123456789", "00200012345678901234"
        )
        self.bank_number = self.bank.scf_account.numero_compte
        self.exercice = ExerciceAnnee.objects.create(
            entreprise=self.entreprise,
            annee=2026,
            is_active=True
        )
        self.client.force_authenticate(user=self.user)

    def _create_bank_account(self, bank_name, account_number, rib):
        index = self.entreprise.bank_accounts.count() + 1
        scf_account = SCFAccount.objects.create(
            entreprise=self.entreprise,
            numero_compte=f"5129{index:02d}",
            libelle=f"BANQUE {bank_name}",
            classe=5,
        )
        return BankAccount.objects.create(
            entreprise=self.entreprise,
            bank_name=bank_name,
            account_number=account_number,
            rib=rib,
            scf_account=scf_account,
        )

    def _clear_legacy_banks(self):
        self.entreprise.banque = ""
        self.entreprise.numero_compte = ""
        self.entreprise.rib = ""
        self.entreprise.banque2 = ""
        self.entreprise.numero_compte2 = ""
        self.entreprise.rib2 = ""
        self.entreprise.save(update_fields=[
            "banque", "numero_compte", "rib",
            "banque2", "numero_compte2", "rib2",
        ])

    def _upload_statement(self, webhook_data):
        with patch("core.views.call_webhook", return_value=webhook_data):
            return self.client.post(
                f"/api/entreprises/{self.entreprise.id}/releves-bancaires/upload/",
                {"file": SimpleUploadedFile(
                    "releve.jpg", b"image", content_type="image/jpeg"
                )},
                format="multipart",
            )

    @staticmethod
    def _statement_webhook_data(**identity):
        return {
            "journal": "Banque",
            "lignes": [{
                "date": "01/02/2026",
                "libelle": "Frais bancaires",
                "sens": "credit",
                "montant": 10,
            }],
            **identity,
        }

    def test_upload_uses_legacy_scf_account_without_bankaccount_record(self):
        scf_account = self.bank.scf_account
        self.entreprise.bank_accounts.all().delete()
        self.entreprise.banque = "BNA"
        self.entreprise.numero_compte = "002000123456789"
        self.entreprise.rib = "00200012345678901234"
        self.entreprise.save(update_fields=["banque", "numero_compte", "rib"])

        response = self._upload_statement(self._statement_webhook_data(
            numero_compte_bancaire=self.entreprise.numero_compte,
            nom_entreprise=self.entreprise.nom,
        ))

        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("id", response.data["compte_bancaire"])
        self.assertEqual(
            response.data["compte_bancaire"]["numero_compte"],
            scf_account.numero_compte,
        )
        self.assertEqual(
            response.data["ecritures_preview"][0]["compte_credit"],
            scf_account.numero_compte,
        )

    def test_bank_account_mismatch_raises_error(self):
        data = {
            "nom_banque": "CPA",  # Wrong bank
            "nom_entreprise": self.entreprise.nom,
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
        self.assertIn("ne correspond pas au nom de la banque", str(ctx.exception))

    def test_identity_validation_accepts_normalized_bank_alias_and_company_name(self):
        data = {
            "nom_banque": "Banque Nationale d'Algerie BNA",
            "nom_entreprise": "  sarL   test algerie ",
        }
        self.assertEqual(
            validate_statement_identity(self.entreprise, data),
            (data["nom_banque"], data["nom_entreprise"].strip()),
        )

    def test_identity_validation_rejects_missing_bank_identity_even_for_one_bank(self):
        data = {"nom_entreprise": self.entreprise.nom}
        with self.assertRaises(BankStatementError) as ctx:
            validate_statement_identity(self.entreprise, data)
        self.assertNotIn("nom_banque", data)
        self.assertIn("identité bancaire est absente", str(ctx.exception))

    def test_identity_validation_accepts_second_registered_bank(self):
        make_bank(self.entreprise, "CPA")
        bank, company = validate_statement_identity(
            self.entreprise,
            {"nom_banque": "CPA", "nom_entreprise": self.entreprise.nom},
        )
        self.assertEqual((bank, company), ("CPA", self.entreprise.nom))

    def test_local_mock_webhook_returns_statement_identity(self):
        response = self.client.post(
            "/api/scanner/mock-webhook/",
            {
                "document_type": "releve_bancaire",
                "journal_hint": "Banque",
                "entreprise_nom": self.entreprise.nom,
                "banques": self.bank.bank_name,
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["statut"], "ok")
        self.assertEqual(response.data["nom_banque"], self.bank.bank_name)
        self.assertEqual(response.data["nom_entreprise"], self.entreprise.nom)

    def test_webhook_payload_without_bank_name_is_rejected(self):
        """No fallback: a payload without bank or company name is never completed."""
        with patch("core.views.call_webhook") as webhook:
            webhook.return_value = {
                "journal": "Banque",
                "lignes": [{
                    "date": "01/02/2026",
                    "libelle": "Frais bancaires",
                    "sens": "credit",
                    "montant": 10,
                }],
            }
            request = self.client.post(
                f"/api/entreprises/{self.entreprise.id}/releves-bancaires/upload/",
                {"file": SimpleUploadedFile("releve.jpg", b"image", content_type="image/jpeg")},
                format="multipart",
            )
        self.assertEqual(request.status_code, 400)
        self.assertIn("nom de la banque n'a pas pu être extrait", request.data["error"])

    def test_upload_accepts_bank_account_only_company_with_extracted_identity(self):
        self._clear_legacy_banks()
        bank = self._create_bank_account("CPA", "CPA-12345", "CPA-RIB-12345")

        response = self._upload_statement(self._statement_webhook_data(
            nom_banque=bank.bank_name,
            nom_entreprise=self.entreprise.nom,
        ))

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["nom_banque"], bank.bank_name)

    def test_upload_matches_by_bank_name(self):
        response = self._upload_statement(
            self._statement_webhook_data(
                nom_banque="BNA", nom_entreprise=self.entreprise.nom
            )
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["nom_banque"], "BNA")

    def test_upload_matches_by_account_number(self):
        self._clear_legacy_banks()
        self._create_bank_account("BNA", "BNA-12345", "BNA-RIB-12345")
        second = self._create_bank_account("CPA", "CPA-12345", "CPA-RIB-12345")

        response = self._upload_statement(
            self._statement_webhook_data(
                nom_entreprise=self.entreprise.nom,
                numero_compte_bancaire=second.account_number,
            )
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["nom_banque"], second.bank_name)
        self.assertEqual(response.data["compte_bancaire"]["id"], second.id)
        self.assertEqual(
            response.data["compte_bancaire"]["numero_compte"],
            second.scf_account.numero_compte,
        )

    def test_upload_matches_by_rib(self):
        self._clear_legacy_banks()
        self._create_bank_account("BNA", "BNA-12345", "BNA-RIB-12345")
        second = self._create_bank_account("CPA", "CPA-12345", "CPA-RIB-12345")

        response = self._upload_statement(
            self._statement_webhook_data(
                nom_banque=second.bank_name,
                nom_entreprise=self.entreprise.nom,
                rib=second.rib,
            )
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["data"]["nom_banque"], second.bank_name)

    def test_upload_rejects_missing_bank_name_when_multiple_banks_are_configured(self):
        self._create_bank_account("CPA", "CPA-12345", "CPA-RIB-12345")

        response = self._upload_statement(self._statement_webhook_data())

        self.assertEqual(response.status_code, 400)
        self.assertIn("nom de la banque n'a pas pu être extrait", response.data["error"])

    def test_upload_rejects_conflicting_identifiers(self):
        self._clear_legacy_banks()
        self._create_bank_account("BNA", "BNA-12345", "BNA-RIB-12345")
        second = self._create_bank_account("CPA", "CPA-12345", "CPA-RIB-12345")

        response = self._upload_statement(self._statement_webhook_data(
            nom_banque="BNA",
            nom_entreprise=self.entreprise.nom,
            numero_compte_bancaire=second.account_number,
        ))

        self.assertEqual(response.status_code, 400)
        self.assertIn("identifient des banques différentes", response.data["error"])
        self.assertIn("numéro de compte du relevé ne correspond", response.data["error"])

    def test_upload_rejects_unknown_bank(self):
        response = self._upload_statement(
            self._statement_webhook_data(
                nom_banque="CPA", nom_entreprise=self.entreprise.nom
            )
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("ne correspond pas au nom de la banque", response.data["error"])

    def test_upload_rejects_company_without_configured_banks(self):
        self._clear_legacy_banks()
        self.entreprise.bank_accounts.all().delete()

        response = self._upload_statement(
            self._statement_webhook_data(
                nom_banque="BNA", nom_entreprise=self.entreprise.nom
            )
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Aucune banque n'est enregistrée", response.data["error"])

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

    def test_duplicate_requires_same_date_piece_label_and_amount(self):
        """Un même numéro de pièce ne doit pas déclencher de doublon si au moins un autre champ diffère."""
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

        data2 = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "11/01/2026",
                    "libelle": "Autre Virement",
                    "reference": "VIR-2001",
                    "sens": "credit",
                    "montant": 50000.0,
                    "compte_contrepartie": "401000",
                }
            ]
        }
        entries = import_bank_statement(self.entreprise, data2)
        self.assertEqual(len(entries), 1)

    def test_duplicate_same_date_piece_label_and_amount_raises_error(self):
        """Le doublon est bien détecté quand les 4 champs requis concordent exactement."""
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

        data2 = {
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
        with self.assertRaises(BankStatementError) as ctx:
            import_bank_statement(self.entreprise, data2)
        self.assertIn("Doublon détecté", str(ctx.exception))

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
        statement = BankStatement.objects.get(entreprise=self.entreprise)
        self.assertEqual(statement.nom_banque, self.bank.bank_name)
        self.assertEqual(statement.nom_entreprise, self.entreprise.nom)
        self.assertEqual(statement.statut, BankStatement.Statut.VALIDE)

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
        self.assertEqual(l_credit1.numero_compte, self.bank_number)
        self.assertEqual(float(l_credit1.montant_credit), 120000.0)

        # 2. Opération 2: Recette Client 350000 DA (encaissement -> débit 512000, crédit 411xxx)
        ec2 = ecritures[1]
        self.assertEqual(ec2.statut, Ecriture.Statut.VALIDE)
        lignes2 = list(ec2.lignes.all())
        self.assertEqual(len(lignes2), 2)
        l_debit2 = [l for l in lignes2 if float(l.montant_debit) > 0][0]
        l_credit2 = [l for l in lignes2 if float(l.montant_credit) > 0][0]
        self.assertEqual(l_debit2.numero_compte, self.bank_number)
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
        self.assertEqual(l_credit3.numero_compte, self.bank_number)
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
        self.assertEqual(l_debit.numero_compte, self.bank_number)

    def test_versement_creates_banque_and_caisse_entries(self):
        """When import contains VERSEMENT, create both Banque and Caisse entries."""
        data = {
            "numero_compte": "002000123456789",
            "lignes": [
                {
                    "date": "20/02/2026",
                    "libelle": "VERSEMENT ESPECES",
                    "reference": "VIR-5001",
                    "sens": "debit",
                    "montant": 20000.0,
                }
            ],
        }

        created = import_bank_statement(self.entreprise, data)
        # Expect two created entries: Banque + Caisse
        self.assertEqual(len(created), 2)

        journal_banque = Journal.objects.get(entreprise=self.entreprise, type_journal=Journal.Type.BANQUE)
        journal_caisse = Journal.objects.get(entreprise=self.entreprise, type_journal=Journal.Type.CAISSE)

        ecritures_b = Ecriture.objects.filter(journal=journal_banque)
        ecritures_c = Ecriture.objects.filter(journal=journal_caisse)
        self.assertEqual(ecritures_b.count(), 1)
        self.assertEqual(ecritures_c.count(), 1)

        eb = ecritures_b.first()
        ec = ecritures_c.first()
        # Same date and reference
        self.assertEqual(eb.date_ecriture, ec.date_ecriture)
        self.assertEqual(eb.numero_piece, ec.numero_piece)

        # Banque entry: 512000 Debit / 581000 Credit
        blines = list(eb.lignes.all())
        b_debit = [l for l in blines if float(l.montant_debit) > 0][0]
        b_credit = [l for l in blines if float(l.montant_credit) > 0][0]
        self.assertEqual(b_debit.numero_compte, self.bank_number)
        self.assertEqual(b_credit.numero_compte, "581000")
        self.assertEqual(float(b_debit.montant_debit), 20000.0)
        self.assertEqual(float(b_credit.montant_credit), 20000.0)

        # Caisse entry: 581000 Debit / 530000 Credit
        clines = list(ec.lignes.all())
        c_debit = [l for l in clines if float(l.montant_debit) > 0][0]
        c_credit = [l for l in clines if float(l.montant_credit) > 0][0]
        self.assertEqual(c_debit.numero_compte, "581000")
        self.assertEqual(c_credit.numero_compte, "530000")
        self.assertEqual(float(c_debit.montant_debit), 20000.0)
        self.assertEqual(float(c_credit.montant_credit), 20000.0)

        # Ensure 530000 is NOT present in the banque lines
        accounts_b = {l.numero_compte for l in blines}
        self.assertNotIn("530000", accounts_b)


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

    def test_chq_nos_clt_uses_chq_retour_logic(self):
        d, c = classify_operation("CHQ NOS CLT 000123", "credit", "", "")
        self.assertEqual(d, "401000")
        self.assertEqual(c, BANK_ACCOUNT)

    def test_ch_nos_clt_alias_uses_chq_retour_logic(self):
        d, c = classify_operation("CH NOS CLT 000123", "credit", "", "")
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
            accountant=self.user,
        )
        self.bank = make_bank(self.entreprise, "CPA", "002000999999999", "00200099999999901234")
        self.bank_number = self.bank.scf_account.numero_compte
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
        self.assertEqual(d, self.bank_number)
        self.assertEqual(c, "581000")

    def test_integration_chq_retour_uses_generic_supplier_account(self):
        debit, credit = self._import(
            "CHQ RETOUR FOURNISSEUR", "credit", 30000,
            compte_contrepartie="401123", tiers="FOURNISSEUR ABC",
        )
        self.assertEqual(debit, "401000")
        self.assertEqual(credit, self.bank_number)

    def test_integration_sort_chq_fournisseur(self):
        d, c = self._import("SORT CHQ 00089 FOURNISSEUR", "credit", 30000, tiers="FOURNISSEUR ABC")
        self.assertTrue(d.startswith("401"))
        self.assertEqual(c, self.bank_number)

    def test_integration_encaissement_client(self):
        d, c = self._import("REMISE CHEQUE CLIENT DURAND", "debit", 80000, tiers="CLIENT DURAND")
        self.assertEqual(d, self.bank_number)
        self.assertTrue(c.startswith("411"))

    def test_integration_frais_bancaires(self):
        d, c = self._import("COMMISSION SUR VIREMENT EMIS", "credit", 500)
        self.assertEqual(d, "627000")
        self.assertEqual(c, self.bank_number)

    def test_integration_unknown_sortie_holding(self):
        d, c = self._import("OP DIVERSE NON IDENTIFIEE", "credit", 1000)
        self.assertEqual(d, HOLDING_ACCOUNT)
        self.assertEqual(c, self.bank_number)

    def test_integration_unknown_entree_holding(self):
        d, c = self._import("OP DIVERSE NON IDENTIFIEE", "debit", 1000)
        self.assertEqual(d, self.bank_number)
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



class BankStatementBankMatchingTests(APITestCase):
    """A statement is matched to one registered bank, or rejected. No default bank."""

    def setUp(self):
        self.user = User.objects.create_user(username="cpt-match", password="pw", role="accountant")
        self.entreprise = Entreprise.objects.create(
            nom="SARL MULTI BANQUES",
            nif="333333333333333",
            nis="444444444444444",
            date_creation=date(2025, 1, 1),
            exercice_comptable="janvier-decembre",
            accountant=self.user,
        )
        self.abc = make_bank(self.entreprise, "ABC", "0300300035", "03003000350000000051")
        self.xyz = make_bank(self.entreprise, "XYZ", "0400400046", "04004000460000000062")
        ExerciceAnnee.objects.create(entreprise=self.entreprise, annee=2026, is_active=True)
        self.client.force_authenticate(user=self.user)
        self.upload_url = f"/api/entreprises/{self.entreprise.id}/releves-bancaires/upload/"
        self.import_url = f"/api/entreprises/{self.entreprise.id}/releves-bancaires/import/"

    def statement(self, **overrides):
        data = {
            "statut": "ok",
            "motif": "",
            "nom_banque": "ABC",
            "nom_entreprise": self.entreprise.nom,
            "numero_compte": "0300300035",
            "cle_rib": "51",
            "lignes": [{
                "date": "10/02/2026",
                "libelle": "COMMISSION SUR VIREMENT",
                "sens": "credit",
                "montant": 100,
                "compte_contrepartie": "627000",
            }],
        }
        data.update(overrides)
        return data

    def bank_side_account(self, entry):
        return next(l.numero_compte for l in entry.lignes.all() if l.numero_compte.startswith("512"))

    def test_statement_is_posted_to_the_account_of_its_own_bank(self):
        first = _import_bank_statement(self.entreprise, self.statement())
        second = _import_bank_statement(self.entreprise, self.statement(
            nom_banque="XYZ", numero_compte="0400400046", cle_rib="62",
            lignes=[{"date": "11/02/2026", "libelle": "COMMISSION SUR VIREMENT",
                     "sens": "credit", "montant": 200, "compte_contrepartie": "627000"}],
        ))
        self.assertEqual(self.bank_side_account(first[0]), self.abc.scf_account.numero_compte)
        self.assertEqual(self.bank_side_account(second[0]), self.xyz.scf_account.numero_compte)
        self.assertNotEqual(self.abc.scf_account.numero_compte, self.xyz.scf_account.numero_compte)
        self.assertEqual(
            set(BankStatement.objects.values_list("bank_account_id", flat=True)),
            {self.abc.id, self.xyz.id},
        )

    def test_statement_from_unregistered_bank_is_rejected(self):
        with self.assertRaises(BankStatementError) as ctx:
            _import_bank_statement(self.entreprise, self.statement(nom_banque="ABR"))
        self.assertIn("ABR", str(ctx.exception))
        self.assertIn("ABC, XYZ", str(ctx.exception))
        self.assertEqual(Ecriture.objects.count(), 0)
        self.assertEqual(BankStatement.objects.count(), 0)

    def test_missing_bank_name_is_resolved_from_unique_account_identity(self):
        payload = self.statement()
        del payload["nom_banque"]
        entries = _import_bank_statement(self.entreprise, payload)
        self.assertEqual(self.bank_side_account(entries[0]), self.abc.scf_account.numero_compte)
        self.assertEqual(Ecriture.objects.count(), 1)

    def test_ai_rejection_is_reported_with_its_reason(self):
        payload = self.statement(statut="rejete", motif="Banque ABR ne correspond pas à ABC, XYZ", lignes=[])
        with self.assertRaises(BankStatementRejected) as ctx:
            _import_bank_statement(self.entreprise, payload)
        self.assertEqual(ctx.exception.motif, "Banque ABR ne correspond pas à ABC, XYZ")
        self.assertIn("rejeté par l'analyse IA", str(ctx.exception))
        self.assertEqual(Ecriture.objects.count(), 0)

    def test_ai_rejection_wins_even_when_the_bank_name_matches(self):
        with self.assertRaises(BankStatementRejected):
            _import_bank_statement(self.entreprise, self.statement(statut="Rejeté"))

    def test_wrong_account_number_for_the_matching_bank_is_rejected(self):
        with self.assertRaises(BankStatementError) as ctx:
            _import_bank_statement(self.entreprise, self.statement(numero_compte="0999999999", cle_rib="00"))
        self.assertIn("numéro de compte du relevé ne correspond pas", str(ctx.exception))
        self.assertEqual(Ecriture.objects.count(), 0)

    def test_account_number_with_key_matches_the_saved_account(self):
        entries = _import_bank_statement(
            self.entreprise, self.statement(numero_compte="0300300035-51", cle_rib="")
        )
        self.assertEqual(self.bank_side_account(entries[0]), self.abc.scf_account.numero_compte)

    def test_two_accounts_at_the_same_bank_are_told_apart_by_account_number(self):
        second_abc = make_bank(self.entreprise, "ABC", "0500500057", "05005000570000000073")
        entries = _import_bank_statement(
            self.entreprise, self.statement(numero_compte="0500500057", cle_rib="73")
        )
        self.assertEqual(self.bank_side_account(entries[0]), second_abc.scf_account.numero_compte)

    def test_two_accounts_at_the_same_bank_without_a_number_are_rejected(self):
        make_bank(self.entreprise, "ABC", "0500500057")
        payload = self.statement()
        del payload["numero_compte"], payload["cle_rib"]
        with self.assertRaises(BankStatementError) as ctx:
            _import_bank_statement(self.entreprise, payload)
        self.assertIn("Plusieurs comptes", str(ctx.exception))
        self.assertEqual(Ecriture.objects.count(), 0)

    def test_company_without_registered_banks_cannot_import(self):
        other = Entreprise.objects.create(
            nom="SANS BANQUE", date_creation=date(2025, 1, 1),
            exercice_comptable="2026", accountant=self.user,
        )
        with self.assertRaises(BankStatementError) as ctx:
            _import_bank_statement(other, self.statement(nom_entreprise="SANS BANQUE"))
        self.assertIn("Aucune banque n'est enregistrée", str(ctx.exception))

    def test_preview_shows_the_matched_banks_own_account(self):
        rows = preview_entries(self.statement(), self.xyz.scf_account.numero_compte)
        self.assertEqual(rows[0]["compte_credit"], self.xyz.scf_account.numero_compte)
        self.assertEqual(rows[0]["compte_debit"], "627000")

    def test_upload_sends_every_registered_bank_to_the_ai(self):
        make_bank(self.entreprise, "BNA")
        with patch("core.views.call_webhook") as webhook:
            webhook.return_value = self.statement()
            response = self.client.post(
                self.upload_url,
                {"file": SimpleUploadedFile("releve.jpg", b"image", content_type="image/jpeg")},
                format="multipart",
            )
        self.assertEqual(response.status_code, 200, response.data)
        context = webhook.call_args.kwargs["context"]
        self.assertEqual(context["banques"], "ABC | XYZ | BNA")
        self.assertEqual(context["nombre_banques"], "3")
        self.assertIn("ABC (compte 0300300035, RIB 03003000350000000051)", context["comptes_bancaires"])
        self.assertIn("XYZ (compte 0400400046", context["comptes_bancaires"])
        self.assertIn("BNA", context["comptes_bancaires"])
        self.assertNotIn("banque2", context)
        self.assertEqual(response.data["compte_bancaire"]["id"], self.abc.id)
        self.assertEqual(
            response.data["ecritures_preview"][0]["compte_credit"],
            self.abc.scf_account.numero_compte,
        )

    def test_upload_returns_the_ai_rejection_reason_to_the_user(self):
        with patch("core.views.call_webhook") as webhook:
            webhook.return_value = {
                "statut": "rejete", "motif": "Banque ABR ne correspond pas aux banques de l'entreprise",
                "nom_banque": "ABR", "lignes": [],
            }
            response = self.client.post(
                self.upload_url,
                {"file": SimpleUploadedFile("releve.jpg", b"image", content_type="image/jpeg")},
                format="multipart",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["statut"], "rejete")
        self.assertEqual(response.data["motif"], "Banque ABR ne correspond pas aux banques de l'entreprise")
        self.assertIn("rejeté par l'analyse IA", response.data["error"])

    def test_upload_without_registered_banks_does_not_call_the_ai(self):
        other = Entreprise.objects.create(
            nom="SANS BANQUE", date_creation=date(2025, 1, 1),
            exercice_comptable="2026", accountant=self.user,
        )
        with patch("core.views.call_webhook") as webhook:
            response = self.client.post(
                f"/api/entreprises/{other.id}/releves-bancaires/upload/",
                {"file": SimpleUploadedFile("releve.jpg", b"image", content_type="image/jpeg")},
                format="multipart",
            )
        self.assertEqual(response.status_code, 400)
        webhook.assert_not_called()

    def test_import_endpoint_rejects_a_reviewed_statement_from_another_bank(self):
        response = self.client.post(self.import_url, {"data": self.statement(nom_banque="ABR")}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Ecriture.objects.count(), 0)

    def test_renaming_a_bank_renames_its_ledger_account(self):
        self.abc.bank_name = "ABC RENAMED"
        self.abc.save()
        self.abc.scf_account.refresh_from_db()
        self.assertEqual(self.abc.scf_account.libelle, "BANQUE ABC RENAMED")
        self.entreprise.save()
        self.abc.scf_account.refresh_from_db()
        self.assertEqual(self.abc.scf_account.libelle, "BANQUE ABC RENAMED")
