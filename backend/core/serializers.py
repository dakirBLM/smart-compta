from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    ClientAccess,
    ClientComptable,
    Ecriture,
    Entreprise,
    ExerciceAnnee,
    Facture,
    Fournisseur,
    Journal,
    LigneEcriture,
    Message,
)

User = get_user_model()

# Fields that can never be modified once the entreprise is created.
LOCKED_ENTREPRISE_FIELDS = ("nif", "nis", "exercice_comptable")


class ExerciceAnneeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExerciceAnnee
        fields = ["id", "entreprise", "annee", "is_active"]
        read_only_fields = ["entreprise"]


class EntrepriseSerializer(serializers.ModelSerializer):
    exercices = ExerciceAnneeSerializer(many=True, read_only=True)
    clients_count = serializers.SerializerMethodField()

    class Meta:
        model = Entreprise
        fields = [
            "id", "nom", "nif", "nis", "nin", "date_creation", "adresse", "ville",
            "code_postal", "exercice_comptable",
            "banque", "numero_compte", "rib",
            "banque2", "numero_compte2", "rib2",
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
        # Activity-dependent required fields.
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
        return attrs

    def update(self, instance, validated_data):
        # Enforce locked fields: silently ignore any attempt to change them.
        for field in LOCKED_ENTREPRISE_FIELDS:
            validated_data.pop(field, None)
        return super().update(instance, validated_data)


class ClientAccessSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="client.username", read_only=True)
    email = serializers.EmailField(source="client.email", read_only=True)

    class Meta:
        model = ClientAccess
        fields = ["id", "client", "entreprise", "nom_client", "username",
                  "email", "created_at"]
        read_only_fields = ["client", "entreprise", "created_at"]


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


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source="sender.username", read_only=True)
    sender_role = serializers.CharField(source="sender.role", read_only=True)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id", "entreprise", "sender", "sender_username", "sender_role",
            "client_user", "content", "read_at", "created_at", "is_mine",
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


class EcritureSerializer(serializers.ModelSerializer):
    lignes = LigneEcritureSerializer(many=True)
    total_debit = serializers.SerializerMethodField()
    total_credit = serializers.SerializerMethodField()

    class Meta:
        model = Ecriture
        fields = [
            "id", "journal", "date_ecriture", "numero_piece", "fournisseur_client",
            "source", "confiance_ia", "statut", "mode_paiement", "created_at", "lignes",
            "total_debit", "total_credit",
        ]
        read_only_fields = ["journal", "created_at"]

    def get_total_debit(self, obj):
        return obj.total_debit

    def get_total_credit(self, obj):
        return obj.total_credit

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


class FactureSerializer(serializers.ModelSerializer):
    client_nom = serializers.CharField(source="client.username", read_only=True)

    class Meta:
        model = Facture
        fields = [
            "id", "entreprise", "client", "client_nom", "numero_facture",
            "date_facture", "montant_ht", "tva_pourcentage", "montant_tva",
            "montant_ttc", "image_url", "statut", "confiance_ia", "ecriture",
            "mode_paiement", "created_at",
        ]
        # entreprise is resolved server-side (from the client's ClientAccess),
        # so it must not be required in the request payload.
        read_only_fields = ["client", "entreprise", "created_at", "ecriture"]
