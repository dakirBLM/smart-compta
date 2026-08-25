from django.db import migrations


def renumber_legacy_bank_accounts(apps, schema_editor):
    SCFAccount = apps.get_model("core", "SCFAccount")
    LigneEcriture = apps.get_model("core", "LigneEcriture")

    for account in SCFAccount.objects.filter(entreprise__isnull=False, numero_compte="512000"):
        if SCFAccount.objects.filter(
            entreprise=account.entreprise, numero_compte="512001"
        ).exists():
            account.delete()
        else:
            account.numero_compte = "512001"
            account.libelle = f"BANQUE {account.entreprise.banque}" if account.entreprise.banque else account.libelle
            account.save(update_fields=["numero_compte", "libelle"])

    LigneEcriture.objects.filter(numero_compte="512000").update(numero_compte="512001")


class Migration(migrations.Migration):
    dependencies = [("core", "0009_cleanup_scf_accounts")]
    operations = [migrations.RunPython(renumber_legacy_bank_accounts, migrations.RunPython.noop)]