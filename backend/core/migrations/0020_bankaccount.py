from django.db import migrations, models
import django.db.models.deletion
from django.db.migrations.exceptions import IrreversibleError


def _normalized_label(value):
    return " ".join(str(value or "").split()).casefold()


def copy_legacy_bank_accounts(apps, schema_editor):
    db_alias = schema_editor.connection.alias
    Entreprise = apps.get_model("core", "Entreprise")
    SCFAccount = apps.get_model("core", "SCFAccount")
    BankAccount = apps.get_model("core", "BankAccount")

    for entreprise in Entreprise.objects.using(db_alias).iterator():
        legacy_banks = (
            (
                entreprise.banque,
                entreprise.numero_compte,
                entreprise.rib,
                "512001",
            ),
            (
                entreprise.banque2,
                entreprise.numero_compte2,
                entreprise.rib2,
                "512002",
            ),
        )

        for bank_name, account_number, rib, scf_number in legacy_banks:
            if not any((bank_name, account_number, rib)):
                continue

            label = f"BANQUE {bank_name}" if bank_name else "BANQUE"
            scf_account, _ = SCFAccount.objects.using(db_alias).get_or_create(
                entreprise_id=entreprise.pk,
                numero_compte=scf_number,
                defaults={"libelle": label, "classe": 5},
            )
            if bank_name and _normalized_label(scf_account.libelle) != _normalized_label(label):
                raise RuntimeError(
                    f"Cannot map company {entreprise.pk} bank {bank_name!r} to "
                    f"SCF account {scf_number}: its existing label is "
                    f"{scf_account.libelle!r}. Resolve the mismatch before migrating."
                )

            existing_bank = BankAccount.objects.using(db_alias).filter(
                scf_account_id=scf_account.pk
            ).first()
            if existing_bank:
                if existing_bank.entreprise_id != entreprise.pk:
                    raise RuntimeError(
                        f"SCF account {scf_number} for company {entreprise.pk} "
                        f"is already associated with a bank from company "
                        f"{existing_bank.entreprise_id}."
                    )
                if (
                    existing_bank.bank_name != bank_name
                    or existing_bank.account_number != account_number
                    or existing_bank.rib != rib
                ):
                    raise RuntimeError(
                        f"Existing bank data for company {entreprise.pk}, "
                        f"SCF account {scf_number} differs from its legacy fields."
                    )
                continue

            BankAccount.objects.using(db_alias).create(
                entreprise_id=entreprise.pk,
                scf_account_id=scf_account.pk,
                bank_name=bank_name,
                account_number=account_number,
                rib=rib,
            )


def prevent_reverse(apps, schema_editor):
    raise IrreversibleError(
        "Migration 0020_bankaccount cannot be reversed because BankAccount "
        "records may contain bank information not present in legacy fields."
    )


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0019_alter_message_content_messageattachment"),
    ]

    operations = [
        migrations.CreateModel(
            name="BankAccount",
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
                (
                    "bank_name",
                    models.CharField(blank=True, default="", max_length=120),
                ),
                (
                    "account_number",
                    models.CharField(blank=True, default="", max_length=60),
                ),
                ("rib", models.CharField(blank=True, default="", max_length=60)),
                (
                    "entreprise",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="bank_accounts",
                        to="core.entreprise",
                    ),
                ),
                (
                    "scf_account",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="bank_account",
                        to="core.scfaccount",
                    ),
                ),
            ],
            options={
                "ordering": ["id"],
            },
        ),
        migrations.RunPython(
            copy_legacy_bank_accounts,
            prevent_reverse,
        ),
    ]
