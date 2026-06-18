from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    ClientAccess,
    Ecriture,
    Entreprise,
    ExerciceAnnee,
    Facture,
    Journal,
    LigneEcriture,
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
            "id", "nom", "nif", "nis", "date_creation", "adresse", "ville",
            "code_postal", "exercice_comptable", "banque", "numero_compte", "rib",
            "regime_fiscale", "activite", "matiere_premiere", "marchandise",
            "matieres_consommables", "telephone", "email", "accountant",
            "created_at", "exercices", "clients_count",
        ]
        read_only_fields = ["accountant", "created_at"]

    def get_clients_count(self, obj):
        return obj.client_accesses.count()

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
    """Used by the accountant to create a client account + access link."""

    nom_client = serializers.CharField()
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur existe déjà.")
        return value


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
    type_label = serializers.CharField(source="get_type_journal_display", read_only=True)
    ecritures_count = serializers.SerializerMethodField()

    class Meta:
        model = Journal
        fields = ["id", "entreprise", "annee", "type_journal", "type_label",
                  "ecritures_count", "created_at"]
        read_only_fields = ["entreprise", "created_at"]

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
