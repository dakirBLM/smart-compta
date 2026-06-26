# Generated manually 2026-06-26 — Fournisseur, ClientComptable, Message

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0002_alter_journal_options_alter_journal_unique_together_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientComptable',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom', models.CharField(max_length=255)),
                ('numero_compte', models.CharField(max_length=20)),
                ('email', models.EmailField(blank=True, default='')),
                ('telephone', models.CharField(blank=True, default='', max_length=30)),
                ('adresse', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('entreprise', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='clients_comptables', to='core.entreprise')),
            ],
            options={
                'ordering': ['nom'],
                'unique_together': {('entreprise', 'numero_compte')},
            },
        ),
        migrations.CreateModel(
            name='Fournisseur',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nom', models.CharField(max_length=255)),
                ('numero_compte', models.CharField(max_length=20)),
                ('email', models.EmailField(blank=True, default='')),
                ('telephone', models.CharField(blank=True, default='', max_length=30)),
                ('adresse', models.CharField(blank=True, default='', max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('entreprise', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fournisseurs', to='core.entreprise')),
            ],
            options={
                'ordering': ['nom'],
                'unique_together': {('entreprise', 'numero_compte')},
            },
        ),
        migrations.CreateModel(
            name='Message',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('content', models.TextField()),
                ('read_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('client_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='conversation_messages', to=settings.AUTH_USER_MODEL)),
                ('entreprise', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='core.entreprise')),
                ('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sent_messages', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
