from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Import signals to attach post_save handlers for Fournisseur / ClientComptable
        try:
            from . import signals  # noqa: F401
        except Exception:
            pass
