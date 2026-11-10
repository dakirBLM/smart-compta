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

    def validate(self, attrs):
        delete = attrs.get("delete", False)
        bank_id = attrs.get("id")
        supplied_fields = set(attrs) - {"id", "delete"}

        if delete and (not bank_id or supplied_fields):
            raise serializers.ValidationError(
                "La suppression nécessite uniquement l'identifiant du compte bancaire."
            )
        if not bank_id and delete:
            raise serializers.ValidationError(
                "Un identifiant est obligatoire pour supprimer un compte bancaire."
            )
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
        read_only_fields = ["accountant", "created_at"]

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

    def validate_numero_compte(self, v):
        return self._digit_limit(v, 10, "Le numéro de compte")

    def validate_numero_compte2(self, v):
        return self._digit_limit(v, 10, "Le numéro de compte")

    def validate_rib(self, v):
        return self._digit_limit(v, 22, "Le RIB")

    def validate_rib2(self, v):
        return self._digit_limit(v, 22, "Le RIB")

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
        return attrs

    def _create_bank_account(self, entreprise, bank_data):
        bank_name = bank_data["bank_name"].strip()
        account_number = bank_data.get("account_number", "")
        rib = bank_data.get("rib", "")
        expected_label = f"BANQUE {bank_name}"

        legacy_slots = (
            (entreprise.banque, entreprise.numero_compte, entreprise.rib, "512001"),
            (entreprise.banque2, entreprise.numero_compte2, entreprise.rib2, "512002"),
        )
        scf_account = None
        for legacy_name, legacy_number, legacy_rib, scf_number in legacy_slots:
            if (bank_name, account_number, rib) == (
                legacy_name, legacy_number, legacy_rib
            ) and any((legacy_name, legacy_number, legacy_rib)):
                scf_account, _ = SCFAccount.objects.get_or_create(
                    entreprise=entreprise,
                    numero_compte=scf_number,
                    defaults={"libelle": expected_label, "classe": 5},
                )
                if scf_account.libelle.strip().casefold() != expected_label.casefold():
                    raise serializers.ValidationError({
                        "bank_accounts": (
                            f"Le libellé du compte SCF {scf_number} "
                            "ne correspond pas à cette banque."
                        )
                    })
                break

        if scf_account is None:
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
                libelle=expected_label,
                classe=5,
            )

        existing_bank = BankAccount.objects.filter(
            scf_account=scf_account
        ).first()
        if existing_bank:
            if (
                existing_bank.entreprise_id == entreprise.pk
                and existing_bank.bank_name == bank_name
                and existing_bank.account_number == account_number
                and existing_bank.rib == rib
            ):
                return existing_bank
            raise serializers.ValidationError({
                "bank_accounts": (
                    f"Le compte SCF {scf_account.numero_compte} est déjà associé "
                    "à un autre compte bancaire."
                )
            })

        return BankAccount.objects.create(
            entreprise=entreprise,
            bank_name=bank_name,
            account_number=account_number,
            rib=rib,
            scf_account=scf_account,
        )

    def _save_bank_accounts(self, entreprise, bank_accounts):
        for bank_data in bank_accounts:
            data = dict(bank_data)
            bank_id = data.pop("id", None)
            should_delete = data.pop("delete", False)
            if bank_id is None:
                self._create_bank_account(entreprise, data)
                continue

            bank_account = entreprise.bank_accounts.get(pk=bank_id)
            if should_delete:
                bank_account.delete()
                continue

            for field in ("bank_name", "account_number", "rib"):
                if field in data:
                    value = data[field]
                    setattr(bank_account, field, value.strip() if field == "bank_name" else value)
            bank_account.save()

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
        entreprise = super().update(instance, validated_data)
        if bank_accounts is not None:
            Entreprise.objects.select_for_update().get(pk=entreprise.pk)
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
