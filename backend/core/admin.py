from django.contrib import admin

from .models import (
    ClientAccess,
    Ecriture,
    Entreprise,
    ExerciceAnnee,
    Facture,
    Journal,
    LigneEcriture,
)


class LigneInline(admin.TabularInline):
    model = LigneEcriture
    extra = 0


@admin.register(Ecriture)
class EcritureAdmin(admin.ModelAdmin):
    list_display = ("id", "numero_piece", "fournisseur_client", "date_ecriture",
                    "source", "statut", "confiance_ia")
    list_filter = ("source", "statut")
    inlines = [LigneInline]


admin.site.register(Entreprise)
admin.site.register(ExerciceAnnee)
admin.site.register(ClientAccess)
admin.site.register(Journal)
admin.site.register(Facture)
