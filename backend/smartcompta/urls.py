from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def root(request):
    """Friendly landing for the API root (the UI lives on the Next.js app)."""
    return JsonResponse({
        "service": "Smart Compta API",
        "status": "ok",
        "frontend": "http://localhost:3000",
        "admin": "/admin/",
        "endpoints": ["/api/auth/login/", "/api/entreprises/", "/api/factures/",
                      "/api/scanner/upload/"],
    })


urlpatterns = [
    path("", root),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("core.urls")),
]
