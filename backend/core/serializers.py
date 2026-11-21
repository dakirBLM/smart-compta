import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db.models import Q
from django.urls import reverse
from rest_framework import serializers

from .models import (
    BankAccount,
    ClientAccess,
    ClientComptable,
    BankStatementSubmission,
    SCFAccount,
    Ecriture,
    Entreprise,
    ExerciceAnnee,
    Facture,
    Fournisseur,
    Journal,
    LigneEcriture,
    Message,
    MessageAttachment,
)

User = get_user_model()

# Fields that can never be modified once the entreprise is created.
LOCKED_ENTREPRISE_FIELDS = ("nif", "nis", "exercice_comptable")
LEGACY_BANK_SLOTS = {
    "512001": ("banque", "numero_compte", "rib"),
    "512002": ("banque2", "numero_compte2", "rib2"),
}
LEGACY_BANK_IDENTIFIER_LIMITS = {
    "numero_compte": (10, "numéro de compte"),
    "numero_compte2": (10, "numéro de compte"),
    "rib": (22, "RIB"),
    "rib2": (22, "RIB"),
}


def _normalize_bank_identifier(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


class BankSCFAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = SCFAccount
        fields = ["id", "numero_compte", "libelle"]


class BankAccountSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    scf_account = BankSCFAccountSerializer(read_only=True)
    delete = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = BankAccount
        fields = [
            "id", "bank_name", "account_number", "rib", "scf_account", "delete",
        ]
        extra_kwargs = {
            "bank_name": {"required": False},
            "account_number": {"required": False},
            "rib": {"required": False},
        }

    def validate_account_number(self, value):
        if value and (not str(value).isdigit() or len(str(value)) > 10):
            raise serializers.ValidationError(
                "Le numéro de compte doit contenir uniquement des chiffres (max 10)."
            )
        return value

    def validate_rib(self, value):
        if value and (not str(value).isdigit() or len(str(value)) > 22):
            raise serializers.ValidationError(
                "Le RIB doit contenir uniquement des chiffres (max 22)."
            )
        return value

    def validate(self, attrs):
        if attrs.get("delete", False):
            raise serializers.ValidationError(
                "La suppression des comptes bancaires n'est pas autorisée."
            )
        bank_id = attrs.get("id")
        if not bank_id and not attrs.get("bank_name", "").strip():
            raise serializers.ValidationError(
                {"bank_name": "Le nom de la banque est obligatoire."}
            )
        return attrs


class ExerciceAnneeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciceAnnee
        fields = ["id", "entreprise", "annee", "is_active"]
        read_only_fields = ["entreprise"]


class EntrepriseSerializer(serializers.ModelSerializer):
    exercices = ExerciceAnneeSerializer(many=True, read_only=True)
    clients_count = serializers.SerializerMethodField()
    bank_accounts = BankAccountSerializer(many=True, required=False)

    class Meta:
        model = Entreprise
        fields = [
            "id", "nom", "nif", "nis", "nin", "date_creation", "adresse", "ville",
            "code_postal", "exercice_comptable",
            "banque", "numero_compte", "rib",
            "banque2", "numero_compte2", "rib2",
            "bank_accounts",
            "regime_fiscale", "activite", "activite2", "matiere_premiere",
            "marchandise", "matieres_consommables", "telephone", "email",
            "accountant", "created_at", "exercices", "clients_count",
        ]
        # banque/banque2 and their numbers mirror the first two bank_accounts;
        # banks are edited only through bank_accounts.
        read_only_fields = [
            "accountant", "created_at",
            "banque", "numero_compte", "rib",
            "banque2", "numero_compte2", "rib2",
        ]

    def get_clients_count(self, obj):
        return obj.client_accesses.count()

    # --- field-level format rules ---
    def _digit_limit(self, value, maxlen, label):
        if value and (not str(value).isdigit() or len(str(value)) > maxlen):
            raise serializers.ValidationError(
                f"{label} doit contenir uniquement des chiffres (max {maxlen})."
            )
        return value

    def validate_nif(self, v):
        return self._digit_limit(v, 15, "Le NIF")

    def validate_nis(self, v):
        return self._digit_limit(v, 15, "Le NIS")

    def validate_nin(self, v):
        return self._digit_limit(v, 18, "Le NIN")

    def validate_exercice_comptable(self, v):
        if not v or not str(v).strip():
            raise serializers.ValidationError("L'exercice comptable est obligatoire.")
        return v

    def validate(self, attrs):
        # ------------------------------------------------------------------ #
        # Per-accountant NIF / NIS uniqueness
        # (replaces the old global unique=True constraint on the model fields)
        # ------------------------------------------------------------------ #
        request = self.context.get("request")
        accountant = getattr(request, "user", None) if request else None

        if accountant and accountant.is_authenticated:
            exclude_pk = self.instance.pk if self.instance else None
            qs_base = Entreprise.objects.filter(accountant=accountant)
            if exclude_pk:
                qs_base = qs_base.exclude(pk=exclude_pk)

            nif = (attrs.get("nif") or "").strip()
            nis = (attrs.get("nis") or "").strip()

            if nif and qs_base.filter(nif=nif).exists():
                raise serializers.ValidationError(
                    {"nif": f"Une entreprise avec le NIF « {nif} » existe déjà dans votre compte."}
                )
            if nis and qs_base.filter(nis=nis).exists():
                raise serializers.ValidationError(
                    {"nis": f"Une entreprise avec le NIS « {nis} » existe déjà dans votre compte."}
                )

        # ------------------------------------------------------------------ #
        # Activity-dependent required fields
        # ------------------------------------------------------------------ #
        def g(f):
            if f in attrs:
                return attrs[f]
            return getattr(self.instance, f, "") if self.instance else ""

        activites = {g("activite"), g("activite2")}
        errors = {}
        if "Commerciale" in activites and not g("marchandise"):
            errors["marchandise"] = "Obligatoire pour une activité commerciale."
        if "Industrielle" in activites:
            if not g("matiere_premiere"):
                errors["matiere_premiere"] = "Obligatoire pour une activité industrielle."
            if not g("matieres_consommables"):
                errors["matieres_consommables"] = "Obligatoire pour une activité industrielle."
        if errors:
            raise serializers.ValidationError(errors)

        bank_accounts = attrs.get("bank_accounts")
        if bank_accounts is not None:
            seen_ids = set()
            for index, bank_data in enumerate(bank_accounts):
                bank_id = bank_data.get("id")
                if bank_id is None:
                    if self.instance and bank_data.get("delete"):
                        raise serializers.ValidationError({
                            "bank_accounts": {
                                index: "Un identifiant de compte bancaire est obligatoire."
                            }
                        })
                    continue
                if bank_id in seen_ids:
                    raise serializers.ValidationError({
                        "bank_accounts": {index: "Identifiant de compte bancaire dupliqué."}
                    })
                seen_ids.add(bank_id)
                if not self.instance or not self.instance.bank_accounts.filter(pk=bank_id).exists():
                    raise serializers.ValidationError({
                        "bank_accounts": {
                            index: "Ce compte bancaire n'appartient pas à cette entreprise."
                        }
                    })

        if not self.instance:
            named_banks = [
                bank for bank in (bank_accounts or [])
                if str(bank.get("bank_name", "")).strip()
            ]
            if not named_banks:
                raise serializers.ValidationError({
                    "bank_accounts": "Au moins une banque est obligatoire pour créer une entreprise."
                })
        return attrs

    def _create_bank_account(self, entreprise, bank_data):
        bank_name = bank_data["bank_name"].strip()
        account_number = bank_data.get("account_number", "")
        rib = bank_data.get("rib", "")

        if not SCFAccount.objects.filter(
            entreprise__isnull=True, numero_compte="512"
        ).exists():
            raise serializers.ValidationError({
                "bank_accounts": (
                    "Le compte principal SCF 512 est absent du plan comptable."
                )
            })

        existing_numbers = SCFAccount.objects.filter(
            entreprise=entreprise, numero_compte__startswith="512"
        ).values_list("numero_compte", flat=True)
        suffixes = [
            int(number[3:])
            for number in existing_numbers
            if number[3:].isdigit() and int(number[3:]) > 0
        ]
        next_suffix = max(suffixes, default=0) + 1
        scf_account = SCFAccount.objects.create(
            entreprise=entreprise,
            numero_compte=f"512{next_suffix:03d}",
            libelle=f"BANQUE {bank_name}",
            classe=5,
        )
        return BankAccount.objects.create(
            entreprise=entreprise,
            bank_name=bank_name,
            account_number=account_number,
            rib=rib,
            scf_account=scf_account,
        )

    def _raise_bank_identifier_mismatch(self, legacy_field, scf_number):
        label = LEGACY_BANK_IDENTIFIER_LIMITS[legacy_field][1]
        raise serializers.ValidationError({
            "bank_accounts": (
                f"Le {label} historique ne correspond pas au compte bancaire "
                f"lié au compte SCF {scf_number}."
            )
        })

    def _validate_legacy_bank_value(self, legacy_field, value, scf_number):
        limits = LEGACY_BANK_IDENTIFIER_LIMITS.get(legacy_field)
        if not limits:
            return
        max_length, label = limits
        value = str(value or "")
        if value and (not value.isdigit() or len(value) > max_length):
            raise serializers.ValidationError({
                "bank_accounts": (
                    f"Le {label} associé au compte SCF {scf_number} ne peut pas "
                    f"être synchronisé dans le champ historique "
                    f"(maximum {max_length} chiffres)."
                )
            })

    def _prepare_bank_account_updates(
        self, entreprise, validated_data, bank_accounts
    ):
        has_bank_accounts = bank_accounts is not None
        bank_updates = (
            [dict(bank_data) for bank_data in bank_accounts]
            if has_bank_accounts
            else []
        )
        updates_by_id = {
            bank_data["id"]: bank_data
            for bank_data in bank_updates
            if bank_data.get("id") is not None
        }
        linked_banks = {
            bank_account.scf_account.numero_compte: bank_account
            for bank_account in entreprise.bank_accounts.select_for_update()
            .select_related("scf_account")
            .filter(scf_account__numero_compte__in=LEGACY_BANK_SLOTS)
        }

        for scf_number, legacy_fields in LEGACY_BANK_SLOTS.items():
            bank_account = linked_banks.get(scf_number)
            if not bank_account:
                continue

            bank_data = updates_by_id.get(bank_account.pk)
            field_updates = {}
            for relation_field, legacy_field in zip(
                ("bank_name", "account_number", "rib"), legacy_fields
            ):
                original_relation_value = str(
                    getattr(bank_account, relation_field) or ""
                )
                original_legacy_value = str(
                    getattr(entreprise, legacy_field) or ""
                )
                relation_supplied = (
                    bank_data is not None and relation_field in bank_data
                )
                relation_value = (
                    bank_data.get(relation_field)
                    if relation_supplied
                    else original_relation_value
                )
                if relation_field == "bank_name":
                    relation_value = str(relation_value or "").strip()
                else:
                    relation_value = str(relation_value or "")
                legacy_supplied = legacy_field in validated_data
                legacy_value = (
                    str(validated_data[legacy_field] or "")
                    if legacy_supplied
                    else original_legacy_value
                )

                relation_changed = (
                    relation_supplied
                    and relation_value != original_relation_value
                )
                legacy_changed = (
                    legacy_supplied
                    and legacy_value != original_legacy_value
                )
                if not relation_changed and not legacy_changed:
                    continue
                if (
                    relation_changed
                    and legacy_changed
                    and relation_value != legacy_value
                ):
                    raise serializers.ValidationError({
                        "bank_accounts": (
                            f"Les valeurs de « {legacy_field} » et "
                            f"« {relation_field} » sont contradictoires pour "
                            f"le compte SCF {scf_number}."
                        )
                    })

                synchronized_value = (
                    relation_value if relation_changed else legacy_value
                )
                if relation_field in {"account_number", "rib"}:
                    original_relation_id = _normalize_bank_identifier(
                        original_relation_value
                    )
                    original_legacy_id = _normalize_bank_identifier(
                        original_legacy_value
                    )
                    if (
                        original_relation_id
                        and original_legacy_id
                        and original_relation_id != original_legacy_id
                    ):
                        both_updated_same = (
                            relation_changed
                            and legacy_changed
                            and relation_value == legacy_value
                        )
                        if (
                            synchronized_value
                            not in {original_relation_value, original_legacy_value}
                            and not both_updated_same
                        ):
                            self._raise_bank_identifier_mismatch(
                                legacy_field, scf_number
                            )
                    self._validate_legacy_bank_value(
                        legacy_field, synchronized_value, scf_number
                    )
                field_updates[relation_field] = synchronized_value

            bank_name_changed = "bank_name" in field_updates
            if bank_name_changed:
                for relation_field, legacy_field in zip(
                    ("account_number", "rib"), legacy_fields[1:]
                ):
                    relation_value = field_updates.get(
                        relation_field, getattr(bank_account, relation_field) or ""
                    )
                    legacy_value = field_updates.get(
                        relation_field,
                        getattr(entreprise, legacy_field) or "",
                    )
                    if (
                        _normalize_bank_identifier(relation_value)
                        and _normalize_bank_identifier(legacy_value)
                        and _normalize_bank_identifier(relation_value)
                        != _normalize_bank_identifier(legacy_value)
                    ):
                        self._raise_bank_identifier_mismatch(
                            legacy_field, scf_number
                        )

            if not field_updates:
                continue
            if bank_data is None:
                bank_data = {"id": bank_account.pk}
                bank_updates.append(bank_data)
                updates_by_id[bank_account.pk] = bank_data
            for relation_field, value in field_updates.items():
                bank_data[relation_field] = value
                legacy_field = legacy_fields[
                    ("bank_name", "account_number", "rib").index(relation_field)
                ]
                validated_data[legacy_field] = value

        return bank_updates if has_bank_accounts or bank_updates else None

    def _save_bank_accounts(self, entreprise, bank_accounts):
        for bank_data in bank_accounts:
            data = dict(bank_data)
            bank_id = data.pop("id", None)
            if bank_id is None:
                self._create_bank_account(entreprise, data)
                continue

            bank_account = entreprise.bank_accounts.select_related(
                "scf_account"
            ).get(pk=bank_id)
            previous_bank_name = bank_account.bank_name
            for field in ("bank_name", "account_number", "rib"):
                if field in data:
                    value = data[field]
                    setattr(bank_account, field, value.strip() if field == "bank_name" else value)
            legacy_slot = LEGACY_BANK_SLOTS.get(
                bank_account.scf_account.numero_compte
            )
            bank_account.save()
            if bank_account.bank_name != previous_bank_name:
                bank_account.scf_account.libelle = f"BANQUE {bank_account.bank_name}"
                bank_account.scf_account.save(update_fields=["libelle"])
                if legacy_slot:
                    legacy_name_field = legacy_slot[0]
                    setattr(entreprise, legacy_name_field, bank_account.bank_name)
                    entreprise.save(update_fields=[legacy_name_field])

    @transaction.atomic
    def create(self, validated_data):
        bank_accounts = validated_data.pop("bank_accounts", [])
        entreprise = super().create(validated_data)
        if bank_accounts:
            Entreprise.objects.select_for_update().get(pk=entreprise.pk)
            self._save_bank_accounts(entreprise, bank_accounts)
        return entreprise

    @transaction.atomic
    def update(self, instance, validated_data):
        # Enforce locked fields: silently ignore any attempt to change them.
        for field in LOCKED_ENTREPRISE_FIELDS:
            validated_data.pop(field, None)
        bank_accounts = validated_data.pop("bank_accounts", None)
        legacy_bank_fields = {
            field for slot in LEGACY_BANK_SLOTS.values() for field in slot
        }
        if bank_accounts is not None or legacy_bank_fields.intersection(validated_data):
            instance = Entreprise.objects.select_for_update().get(pk=instance.pk)
            bank_accounts = self._prepare_bank_account_updates(
                instance, validated_data, bank_accounts
            )
        entreprise = super().update(instance, validated_data)
        if bank_accounts is not None:
            self._save_bank_accounts(entreprise, bank_accounts)
        return entreprise


class ClientAccessSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="client.username", read_only=True)
    email = serializers.EmailField(source="client.email", read_only=True)

    class Meta:
        model = ClientAccess
        fields = ["id", "client", "entreprise", "nom_client", "username",
                  "email", "created_at"]
        read_only_fields = ["client", "entreprise", "created_at"]


class ClientEntrepriseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Entreprise
        fields = ["id", "nom"]


class BankStatementSubmissionSerializer(serializers.ModelSerializer):
    entreprise_nom = serializers.CharField(source="entreprise.nom", read_only=True)
    client_username = serializers.CharField(source="client.username", read_only=True)

    class Meta:
        model = BankStatementSubmission
        fields = [
            "id", "entreprise", "entreprise_nom", "client", "client_username",
            "original_filename", "submitted_at", "status",
        ]
        read_only_fields = fields


class CreateClientSerializer(serializers.Serializer):

    nom_client = serializers.CharField()
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur existe déjà.")
        return value

    def validate_password(self, value):
        validate_password(value, User(username=self.initial_data.get("username", "")))
        return value


class FournisseurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fournisseur
        fields = [
            "id", "entreprise", "nom", "numero_compte", "email",
            "telephone", "adresse", "created_at",
        ]
        read_only_fields = ["entreprise", "numero_compte", "created_at"]


class ClientComptableSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientComptable
        fields = [
            "id", "entreprise", "nom", "numero_compte", "email",
            "telephone", "adresse", "created_at",
        ]
        read_only_fields = ["entreprise", "numero_compte", "created_at"]


class MessageAttachmentSerializer(serializers.ModelSerializer):
    filename = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    open_url = serializers.SerializerMethodField()

    class Meta:
        model = MessageAttachment
        fields = [
            "id", "filename", "content_type", "size",
            "download_url", "open_url", "uploaded_at",
        ]

    def get_filename(self, obj):
        return obj.original_filename

    def get_download_url(self, obj):
        request = self.context.get("request")
        path = reverse("message-attachment-download", kwargs={"attachment_id": obj.pk})
        if request is not None:
            return request.build_absolute_uri(path)
        return path

    def get_open_url(self, obj):
        request = self.context.get("request")
        path = f"{reverse('message-attachment-download', kwargs={'attachment_id': obj.pk})}?inline=1"
        if request is not None:
            return request.build_absolute_uri(path)
        return path


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)
    sender_role = serializers.CharField(source="sender.role", read_only=True)
    attachments = MessageAttachmentSerializer(many=True, read_only=True)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "entreprise", "sender", "sender_username", "sender_role",
            "client_user", "content", "read_at", "created_at", "is_mine",
            "attachments",
        ]
        read_only_fields = ["entreprise", "sender", "client_user", "created_at"]

    def get_is_mine(self, obj):
        request = self.context.get("request")
        if not request or not request.user:
            return False
        return obj.sender_id == request.user.id


class LigneEcritureSerializer(serializers.ModelSerializer):
    class Meta:
        model = LigneEcriture
        fields = ["id", "numero_compte", "libelle", "montant_debit", "montant_credit"]

    def validate_numero_compte(self, value):
        numero = str(value).strip()
        entreprise = self.context.get("entreprise")

        def scf_exists(num):
            qs = SCFAccount.objects.filter(numero_compte=num)
            if entreprise:
                qs = qs.filter(Q(entreprise__isnull=True) | Q(entreprise=entreprise))
            else:
                qs = qs.filter(entreprise__isnull=True)
            return qs.exists()

        # Accept exact match first
        if scf_exists(numero):
            return numero

        # Accept 6-digit padded accounts whose prefix exists in SCF
        # e.g. "607000" is valid because "607" exists in SCF
        for length in range(len(numero) - 1, 0, -1):
            if scf_exists(numero[:length]):
                return numero

        raise serializers.ValidationError(
            f"Le compte {numero} n'existe pas dans le plan comptable SCF."
        )



class EcritureSerializer(serializers.ModelSerializer):
    lignes = LigneEcritureSerializer(many=True)
    total_debit = serializers.SerializerMethodField()
    total_credit = serializers.SerializerMethodField()
    journal_nom = serializers.SerializerMethodField()

    class Meta:
        model = Ecriture
        fields = [
            "id", "journal", "journal_nom", "date_ecriture", "numero_piece",
            "fournisseur_client", "source", "confiance_ia", "statut",
            "mode_paiement", "image_url", "created_at", "lignes",
            "total_debit", "total_credit",
        ]
        read_only_fields = ["journal", "created_at"]

    def get_total_debit(self, obj):
        return obj.total_debit

    def get_total_credit(self, obj):
        return obj.total_credit

    def get_journal_nom(self, obj):
        try:
            return obj.journal.nom or obj.journal.get_type_journal_display()
        except Exception:
            return ""

    def validate(self, attrs):
        lignes = attrs.get("lignes", getattr(self.instance, "lignes", None))
        if isinstance(lignes, list):
            debit = sum(l.get("montant_debit", 0) for l in lignes)
            credit = sum(l.get("montant_credit", 0) for l in lignes)
            if abs(float(debit) - float(credit)) > 0.01:
                raise serializers.ValidationError(
                    {"lignes": "Le total débit doit être égal au total crédit."}
                )
        return attrs

    def create(self, validated_data):
        lignes_data = validated_data.pop("lignes", [])
        ecriture = Ecriture.objects.create(**validated_data)
        for ligne in lignes_data:
            LigneEcriture.objects.create(ecriture=ecriture, **ligne)
        return ecriture

    def update(self, instance, validated_data):
        lignes_data = validated_data.pop("lignes", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if lignes_data is not None:
            instance.lignes.all().delete()
            for ligne in lignes_data:
                LigneEcriture.objects.create(ecriture=instance, **ligne)
        return instance


class JournalSerializer(serializers.ModelSerializer):
    type_label = serializers.SerializerMethodField()
    ecritures_count = serializers.SerializerMethodField()

    class Meta:
        model = Journal
        fields = ["id", "entreprise", "annee", "type_journal", "nom", "type_label",
                  "ecritures_count", "created_at"]
        read_only_fields = ["entreprise", "created_at"]

    def get_type_label(self, obj):
        # Custom journals display their given name.
        return obj.nom or obj.get_type_journal_display()

    def get_ecritures_count(self, obj):
        return obj.ecritures.count()


class EcritureInlineSerializer(serializers.ModelSerializer):
    """Lightweight read-only ecriture snapshot embedded inside FactureSerializer."""
    lignes = LigneEcritureSerializer(many=True, read_only=True)
    total_debit = serializers.SerializerMethodField()
    total_credit = serializers.SerializerMethodField()
    journal_nom = serializers.SerializerMethodField()

    class Meta:
        model = Ecriture
        fields = [
            "id", "journal", "journal_nom", "date_ecriture", "numero_piece",
            "fournisseur_client", "source", "statut", "mode_paiement",
            "created_at", "lignes", "total_debit", "total_credit",
        ]

    def get_total_debit(self, obj):
        return obj.total_debit

    def get_total_credit(self, obj):
        return obj.total_credit

    def get_journal_nom(self, obj):
        try:
            return obj.journal.nom or obj.journal.get_type_journal_display()
        except Exception:
            return ""


class FactureSerializer(serializers.ModelSerializer):
    client_nom = serializers.CharField(source="client.username", read_only=True)
    ecriture_detail = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Facture
        fields = [
            "id", "entreprise", "client", "client_nom", "numero_facture",
            "date_facture", "montant_ht", "tva_pourcentage", "montant_tva",
            "montant_ttc", "image_url", "statut", "confiance_ia", "ecriture",
            "ecriture_detail", "mode_paiement", "created_at",
            "fournisseur_client", "type_facture",
        ]
        # entreprise is resolved server-side (from the client's ClientAccess),
        # so it must not be required in the request payload.
        read_only_fields = ["client", "entreprise", "created_at", "ecriture", "ecriture_detail"]

    def get_image_url(self, obj):
        if not obj.image_url:
            return ""
        url = obj.image_url
        if url.startswith(("http://", "https://", "data:", "blob:", "file:")):
            return url
        if url.startswith("/"):
            request = self.context.get("request")
            return request.build_absolute_uri(url) if request is not None else url
        return url

    def get_ecriture_detail(self, obj):
        if obj.ecriture_id:
            return EcritureInlineSerializer(obj.ecriture).data
        return None


class SCFAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = SCFAccount
        fields = ["id", "entreprise", "numero_compte", "libelle", "classe", "created_at"]
        read_only_fields = ["created_at"]
