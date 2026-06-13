from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    photo = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "role", "phone", "photo",
                  "first_name", "last_name", "created_at"]
        read_only_fields = ["id", "created_at", "role"]

    def get_photo(self, obj):
        if not obj.photo:
            return None
        url = obj.photo.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class RegisterSerializer(serializers.ModelSerializer):
    """Public sign-up for a new comptable (accountant) account."""

    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = User
        fields = ["username", "password", "email", "phone", "photo"]

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur existe déjà.")
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(role=User.Role.ACCOUNTANT, **validated_data)
        user.set_password(password)
        user.save()
        return user


class UpdateProfileSerializer(serializers.ModelSerializer):
    """Update the current user's own profile (and optionally the password)."""

    password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, min_length=4
    )

    class Meta:
        model = User
        fields = ["username", "email", "phone", "photo", "password"]

    def validate_username(self, value):
        qs = User.objects.filter(username=value).exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ce nom d'utilisateur existe déjà.")
        return value

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(TokenObtainPairSerializer):
    """JWT login that also returns the user payload and the role."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user, context=self.context).data
        return data
