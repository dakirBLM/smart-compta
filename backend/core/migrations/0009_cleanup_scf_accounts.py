from django.db import migrations


def remove_redundant_accounts(apps, schema_editor):
    SCFAccount = apps.get_model("core", "SCFAccount")
    SCFAccount.objects.filter(numero_compte__in=["44566", "645000"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0008_alter_facture_type_facture_scfaccount"),
    ]

    operations = [
        migrations.RunPython(remove_redundant_accounts, migrations.RunPython.noop),
    ]