from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.test import TestCase

from accounts.models import User
from accounts.serializers import RegisterSerializer


class PasswordStorageTests(TestCase):
    def test_new_password_is_argon2_with_a_salt(self):
        user = User(username="cabinet")
        user.set_password("Cabinet-Alger-12!")
        user.save()

        self.assertTrue(user.password.startswith("argon2$"))
        self.assertNotIn("Cabinet-Alger-12!", user.password)
        salt = user.password.split("$")[4]
        self.assertTrue(salt)
        self.assertTrue(check_password("Cabinet-Alger-12!", user.password))

    def test_existing_pbkdf2_password_still_verifies(self):
        stored = make_password("secret", hasher="pbkdf2_sha256")
        user = User.objects.create(username="legacy")
        user.password = stored
        user.save(update_fields=["password"])

        self.assertTrue(user.password.startswith("pbkdf2_sha256$"))
        self.assertTrue(user.check_password("secret"))

    def test_register_rejects_a_short_password(self):
        serializer = RegisterSerializer(data={
            "username": "cabinet",
            "password": "court",
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn("password", serializer.errors)

    def test_complexity_rules_reject_a_password_without_a_symbol(self):
        with self.assertRaises(ValidationError):
            validate_password("CabinetAlger12", User(username="cabinet"))
