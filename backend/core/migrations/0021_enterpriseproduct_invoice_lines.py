from django.db import migrations, models
import django.db.models.deletion


def copy_existing_products(apps, schema_editor):
    Entreprise = apps.get_model("core", "Entreprise")
    EntrepriseProduct = apps.get_model("core", "EntrepriseProduct")
    SCFAccount = apps.get_model("core", "SCFAccount")
    databases = schema_editor.connection.alias

    categories = (
        ("marchandise", "marchandise", "380000"),
        ("matiere_premiere", "matiere_premiere", "381000"),
        ("matieres_consommables", "matieres_consommables", "382000"),
    )
    for entreprise in Entreprise.objects.using(databases).all().iterator():
        for field, category, numero_compte in categories:
            nom = getattr(entreprise, field)
            if not nom or not nom.strip():
                continue
            EntrepriseProduct.objects.using(databases).create(
                entreprise_id=entreprise.pk,
                category=category,
                nom=nom,
                numero_compte=numero_compte,
            )
            SCFAccount.objects.using(databases).get_or_create(
                entreprise_id=entreprise.pk,
                numero_compte=numero_compte,
                defaults={
                    "libelle": nom[:255],
                    "classe": 3,
                },
            )


def restore_existing_products(apps, schema_editor):
    Entreprise = apps.get_model("core", "Entreprise")
    EntrepriseProduct = apps.get_model("core", "EntrepriseProduct")
    Facture = apps.get_model("core", "Facture")
    databases = schema_editor.connection.alias

    if Facture.objects.using(databases).exclude(lignes=[]).exists():
        raise RuntimeError(
            "Cannot reverse product migration after invoice lines have been stored."
        )

    fields = {
        "marchandise": "marchandise",
        "matiere_premiere": "matiere_premiere",
        "matieres_consommables": "matieres_consommables",
    }
    for entreprise in Entreprise.objects.using(databases).all().iterator():
        for field, category in fields.items():
            names = list(
                EntrepriseProduct.objects.using(databases)
                .filter(entreprise_id=entreprise.pk, category=category, is_active=True)
                .order_by("created_at", "id")
                .values_list("nom", flat=True)
            )
            setattr(entreprise, field, "\n".join(names))
        entreprise.save(
            using=databases,
            update_fields=list(fields),
        )


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0020_alter_entreprise_marchandise_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="EntrepriseProduct",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("category", models.CharField(choices=[("marchandise", "Marchandises"), ("matiere_premiere", "Matières premières"), ("matieres_consommables", "Matières consommables")], max_length=32)),
                ("nom", models.CharField(max_length=10000)),
                ("numero_compte", models.CharField(blank=True, default="", max_length=20)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("entreprise", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="products", to="core.entreprise")),
            ],
            options={
                "ordering": ["created_at", "id"],
            },
        ),
        migrations.AddConstraint(
            model_name="entrepriseproduct",
            constraint=models.UniqueConstraint(condition=models.Q(("is_active", True)) & ~models.Q(("numero_compte", "")), fields=("entreprise", "numero_compte"), name="unique_active_product_account"),
        ),
        migrations.AddConstraint(
            model_name="entrepriseproduct",
            constraint=models.UniqueConstraint(condition=models.Q(("is_active", True)), fields=("entreprise", "category", "nom"), name="unique_active_product_name"),
        ),
        migrations.AddField(
            model_name="facture",
            name="lignes",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(copy_existing_products, restore_existing_products),
    ]
