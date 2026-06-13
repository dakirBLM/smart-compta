from django.urls import path

from . import views

urlpatterns = [
    # Entreprises
    path("entreprises/", views.EntrepriseListCreateView.as_view()),
    path("entreprises/<int:pk>/", views.EntrepriseDetailView.as_view()),
    # Clients
    path("entreprises/<int:pk>/clients/", views.ClientListCreateView.as_view()),
    path("entreprises/<int:pk>/clients/<int:client_id>/",
         views.ClientDeleteView.as_view()),
    # Exercices
    path("entreprises/<int:pk>/exercices/", views.ExerciceListCreateView.as_view()),
    # Journaux & écritures
    path("entreprises/<int:pk>/journaux/", views.JournalListView.as_view()),
    path("entreprises/<int:pk>/journaux/<int:journal_id>/ecritures/",
         views.JournalEcrituresView.as_view()),
    path("ecritures/<int:pk>/", views.EcritureDetailView.as_view()),
    # Scanner bridge
    path("scanner/upload/", views.ScannerUploadView.as_view()),
    path("scanner/confirm/", views.ScannerConfirmView.as_view()),
    # Local mock AI webhook (dev only) — set WEBHOOK_URL to this to demo.
    path("scanner/mock-webhook/", views.MockWebhookView.as_view()),
    # Factures
    path("factures/", views.FactureListCreateView.as_view()),
    path("factures/<int:pk>/", views.FactureDetailView.as_view()),
    # Reports
    path("entreprises/<int:pk>/balance/", views.BalanceView.as_view()),
    path("entreprises/<int:pk>/compte-resultat/", views.CompteResultatView.as_view()),
    path("entreprises/<int:pk>/grand-livre/", views.GrandLivreView.as_view()),
    path("entreprises/<int:pk>/dashboard/", views.DashboardView.as_view()),
]
