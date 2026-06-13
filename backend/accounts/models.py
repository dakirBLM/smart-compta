from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Application user. Both accountants and clients are Users."""

    class Role(models.TextChoices):
        ACCOUNTANT = "accountant", "Comptable"
        CLIENT = "client", "Client"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CLIENT)
    phone = models.CharField(max_length=30, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_accountant(self) -> bool:
        return self.role == self.Role.ACCOUNTANT

    @property
    def is_client(self) -> bool:
        return self.role == self.Role.CLIENT

    def __str__(self) -> str:
        return f"{self.username} ({self.role})"
