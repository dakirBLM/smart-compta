from django.conf import settings
from django.db import models


class Entreprise(models.Model):
    nom = models.CharField(max_length=255)
    nif = models.CharField(max_length=50, unique=True)          # locked after creation
    nis = models.CharField(max_length=50, unique=True)          # locked after creation
    date_creation = models.DateField()
    adresse = models.CharField(max_length=255, blank=True, default="")
    ville = models.CharField(max_length=120, blank=True, default="")
    code_postal = models.CharField(max_length=20, blank=True, default="")
    exercice_comptable = models.CharField(max_length=20)        # locked after creation
    banque = models.CharField(max_length=120, blank=True, default="")
    numero_compte = models.CharField(max_length=60, blank=True, default="")
    rib = models.CharField(max_length=60, blank=True, default="")
    regime_fiscale = models.CharField(max_length=120, blank=True, default="")
    activite = models.CharField(max_length=255, blank=True, default="")
    matiere_premiere = models.CharField(max_length=255, blank=True, default="")
    marchandise = models.CharField(max_length=255, blank=True, default="")
    matieres_consommables = models.CharField(max_length=255, blank=True, default="")
    telephone = models.CharField(max_length=30, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    accountant = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="entreprises"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self) -> str:
        return self.nom


class ExerciceAnnee(models.Model):
    entreprise = models.ForeignKey(
        Entreprise, on_delete=models.CASCADE, related_name="exercices"
    )
    annee = models.IntegerField()
    is_active = models.BooleanField(default=False)

    class Meta:
        unique_together = ("entreprise", "annee")
        ordering = ["-annee"]

    def __str__(self) -> str:
        return f"{self.entreprise.nom} - {self.annee}"


class ClientAccess(models.Model):
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="accesses"
    )
    entreprise = models.ForeignKey(
        Entreprise, on_delete=models.CASCADE, related_name="client_accesses"
    )
    nom_client = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("client", "entreprise")

    def __str__(self) -> str:
        return f"{self.nom_client} -> {self.entreprise.nom}"


class Journal(models.Model):
    class Type(models.TextChoices):
        ACHAT = "achat", "Achats"
        VENTE = "vente", "Ventes"
        BANQUE = "banque", "Banque"
        CAISSE = "caisse", "Caisse"
        OD = "od", "Opérations diverses"

    entreprise = models.ForeignKey(
        Entreprise, on_delete=models.CASCADE, related_name="journaux"
    )
    annee = models.ForeignKey(
        ExerciceAnnee, on_delete=models.CASCADE, related_name="journaux"
    )
    type_journal = models.CharField(max_length=20, choices=Type.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("entreprise", "annee", "type_journal")
        ordering = ["type_journal"]

    def __str__(self) -> str:
        return f"{self.entreprise.nom} - {self.get_type_journal_display()} {self.annee.annee}"


class Ecriture(models.Model):
    class Source(models.TextChoices):
        MANUEL = "manuel", "Manuel"
        IMPORT = "import", "Import"
        SCANNER = "scanner", "Scanner"

    class Statut(models.TextChoices):
        EN_COURS = "en_cours", "En cours"
        VALIDE = "valide", "Validé"
        REJETE = "rejete", "Rejeté"

    journal = models.ForeignKey(
        Journal, on_delete=models.CASCADE, related_name="ecritures"
    )
    date_ecriture = models.DateField()
    numero_piece = models.CharField(max_length=60, blank=True, default="")
    fournisseur_client = models.CharField(max_length=255, blank=True, default="")
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUEL)
    confiance_ia = models.IntegerField(null=True, blank=True)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.EN_COURS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date_ecriture", "id"]

    @property
    def total_debit(self):
        return sum((l.montant_debit for l in self.lignes.all()), 0)

    @property
    def total_credit(self):
        return sum((l.montant_credit for l in self.lignes.all()), 0)

    def __str__(self) -> str:
        return f"Écriture {self.numero_piece or self.id}"


class LigneEcriture(models.Model):
    ecriture = models.ForeignKey(
        Ecriture, on_delete=models.CASCADE, related_name="lignes"
    )
    numero_compte = models.CharField(max_length=20)
    libelle = models.CharField(max_length=255, blank=True, default="")
    montant_debit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    montant_credit = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    def __str__(self) -> str:
        return f"{self.numero_compte} - {self.libelle}"


class Facture(models.Model):
    class Statut(models.TextChoices):
        EN_COURS = "en_cours", "En cours"
        VALIDE = "valide", "Validé"
        REJETE = "rejete", "Rejeté"

    entreprise = models.ForeignKey(
        Entreprise, on_delete=models.CASCADE, related_name="factures"
    )
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="factures"
    )
    numero_facture = models.CharField(max_length=60, blank=True, default="")
    date_facture = models.DateField(null=True, blank=True)
    montant_ht = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tva_pourcentage = models.DecimalField(max_digits=5, decimal_places=2, default=19)
    montant_tva = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    montant_ttc = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    image_url = models.CharField(max_length=500, blank=True, default="")
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.EN_COURS)
    confiance_ia = models.IntegerField(null=True, blank=True)
    ecriture = models.ForeignKey(
        Ecriture, on_delete=models.SET_NULL, null=True, blank=True, related_name="factures"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Facture {self.numero_facture or self.id}"
