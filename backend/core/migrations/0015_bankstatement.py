from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0014_replace_class5_me_s_labels"),
    ]

    operations = [
        migrations.CreateModel(
            name="BankStatement",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("nom_banque", models.CharField(max_length=255)),
                ("nom_entreprise", models.CharField(max_length=255)),
                ("date", models.DateField()),
                (
                    "statut",
                    models.CharField(
                        choices=[
                            ("en_attente", "En attente"),
                            ("valide", "Validé"),
                            ("rejete", "Rejeté"),
                        ],
                        default="en_attente",
                        max_length=20,
                    ),
                ),
                ("confiance", models.IntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "entreprise",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="releves_bancaires",
                        to="core.entreprise",
                    ),
                ),
            ],
            options={"ordering": ["-date", "-id"]},
        ),
    ]