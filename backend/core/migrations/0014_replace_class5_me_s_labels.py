import re

from django.db import migrations


def replace_class_5_labels(apps, schema_editor):
    SCFAccount = apps.get_model("core", "SCFAccount")
    for account in SCFAccount.objects.filter(classe=5):
        updated_label = re.sub(
            r"me-es|me-s", "accreditifs", account.libelle, flags=re.IGNORECASE
        )
        if updated_label != account.libelle:
            account.libelle = updated_label
            account.save(update_fields=["libelle"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0013_remove_nom_uniqueness"),
    ]

    operations = [
        migrations.RunPython(replace_class_5_labels, migrations.RunPython.noop),
    ]