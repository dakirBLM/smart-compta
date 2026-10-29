import re

from django.core.exceptions import ValidationError


class PasswordComplexityValidator:
    """Require a long password with mixed characters. The random salt and
    Argon2 hash are applied later by Django's password hasher."""

    def validate(self, password, user=None):
        errors = []
        if len(password) < 12:
            errors.append("Le mot de passe doit contenir au moins 12 caractères.")
        if not re.search(r"[a-z]", password):
            errors.append("Le mot de passe doit contenir une lettre minuscule.")
        if not re.search(r"[A-Z]", password):
            errors.append("Le mot de passe doit contenir une lettre majuscule.")
        if not re.search(r"\d", password):
            errors.append("Le mot de passe doit contenir un chiffre.")
        if not re.search(r"[^A-Za-z0-9]", password):
            errors.append("Le mot de passe doit contenir un symbole.")
        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        return (
            "Au moins 12 caractères, avec une minuscule, une majuscule, "
            "un chiffre et un symbole."
        )
