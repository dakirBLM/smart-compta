# Generated manually 2026-06-18 — adds mode_paiement to Ecriture and Facture

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='ecriture',
            name='mode_paiement',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        migrations.AddField(
            model_name='facture',
            name='mode_paiement',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
    ]
