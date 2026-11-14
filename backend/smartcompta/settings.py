import importlib.util
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-insecure-secret-key-change-me")
DEBUG = os.getenv("DJANGO_DEBUG", "True").lower() == "true"

# Hosts: "*" in dev; in prod set ALLOWED_HOSTS env (comma separated). Render
# also injects RENDER_EXTERNAL_HOSTNAME, which we add automatically.
ALLOWED_HOSTS = [h.strip() for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h.strip()]
_render_host = os.getenv("RENDER_EXTERNAL_HOSTNAME")
if _render_host:
    ALLOWED_HOSTS.append(_render_host)
if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["*"] if DEBUG else []
# Trust the HTTPS host for CSRF (Render/Vercel domains).
CSRF_TRUSTED_ORIGINS = [
    f"https://{h}" for h in ALLOWED_HOSTS if h not in ("*", "localhost", "127.0.0.1")
]
# Only trust forwarded HTTPS when the deployment explicitly enables it and
# the proxy is configured to overwrite the forwarded protocol header.
if os.getenv("DJANGO_TRUST_PROXY_SSL_HEADER", "").lower() == "true":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "corsheaders",
    # Local
    "accounts",
    "core",
]

# Media storage (Cloudinary) — only load if CLOUDINARY_URL is set and the package is installed
cloudinary_available = (
    importlib.util.find_spec("cloudinary_storage") is not None
    and importlib.util.find_spec("cloudinary") is not None
)
if os.getenv("CLOUDINARY_URL") and cloudinary_available:
    INSTALLED_APPS += ["cloudinary_storage", "cloudinary"]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "smartcompta.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "smartcompta.wsgi.application"

# Use DATABASE_URL (e.g. Render Postgres) when present, else local SQLite.
DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
        ssl_require=bool(os.getenv("DATABASE_URL")),
    )
}

AUTH_USER_MODEL = "accounts.User"

# Argon2id is the preferred hasher. It stores a random salt with the hash in
# the password column. Older PBKDF2 hashes still verify, and Django rewrites
# them with Argon2 the next time that user logs in.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "accounts.validators.PasswordComplexityValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Algiers"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}

# Production private storage for uploaded media (message attachments, files).
# Cloudflare R2 uses an S3-compatible API; local development keeps using the
# filesystem unless credentials are configured.
r2_bucket = os.getenv("R2_BUCKET_NAME") or os.getenv("AWS_STORAGE_BUCKET_NAME")
r2_access_key = os.getenv("R2_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY_ID")
r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY") or os.getenv("AWS_SECRET_ACCESS_KEY")
r2_endpoint = os.getenv("R2_ENDPOINT_URL") or os.getenv("AWS_S3_ENDPOINT_URL")
if r2_bucket and r2_access_key and r2_secret_key and r2_endpoint:
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": r2_bucket,
            "access_key": r2_access_key,
            "secret_key": r2_secret_key,
            "endpoint_url": r2_endpoint,
            "region_name": os.getenv("R2_REGION_NAME") or os.getenv("AWS_S3_REGION_NAME") or "auto",
            "file_overwrite": False,
            "default_acl": None,
            "querystring_auth": True,
            "signature_version": "s3v4",
            "addressing_style": "virtual",
        },
    }

# When CLOUDINARY_URL is set (cloudinary://<api_key>:<api_secret>@<cloud_name>),
# uploaded media (avatars, invoice images) goes to Cloudinary and persists.
# Without it, media falls back to local disk (fine for dev). R2 takes
# precedence for private message attachments when configured.
if not r2_bucket and os.getenv("CLOUDINARY_URL") and cloudinary_available:
    STORAGES["default"] = {
        "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage"
    }
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_RENDERER_CLASSES": (
        "rest_framework.renderers.JSONRenderer",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]
CORS_ALLOW_CREDENTIALS = True
# In local dev, accept any origin (localhost, 127.0.0.1, LAN IP for phone testing)
# so the frontend can always reach the API regardless of how it's opened.
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True

# AI extraction webhook used by the scanner bridge.
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")
# How the image is sent to the webhook: "multipart" (binary file field) or
# "base64" (JSON with a data: URI — easiest for LLM vision modules to consume).
WEBHOOK_IMAGE_MODE = os.getenv("WEBHOOK_IMAGE_MODE", "multipart").lower()
# Seconds to wait for the AI webhook to return the extraction (vision models
# can be slow). Keep below gunicorn's --timeout so the worker isn't killed.
WEBHOOK_TIMEOUT = int(os.getenv("WEBHOOK_TIMEOUT", "300"))
