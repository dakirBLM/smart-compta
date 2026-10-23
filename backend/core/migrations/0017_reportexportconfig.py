from django.db import migrations, models

from core.report_template_defaults import DEFAULT_REPORT_EXPORT_CONFIG


def create_default_report_export_config(apps, schema_editor):
    config_model = apps.get_model("core", "ReportExportConfig")
    config_model.objects.get_or_create(
        key="default",
        defaults={"config": DEFAULT_REPORT_EXPORT_CONFIG},
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0016_bankstatementsubmission"),
    ]

    operations = [
        migrations.CreateModel(
            name="ReportExportConfig",
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
                ("key", models.CharField(default="default", max_length=80, unique=True)),
                (
                    "config",
                    models.JSONField(
                        default=dict,
                        help_text=(
                            "JSON report layout and SCF account mappings. "
                            "Calculation formulas are deliberately fixed in code."
                        ),
                    ),
                ),
            ],
            options={
                "verbose_name": "configuration d’export des rapports",
                "verbose_name_plural": "configuration d’export des rapports",
            },
        ),
        migrations.RunPython(
            create_default_report_export_config,
            migrations.RunPython.noop,
        ),
    ]
