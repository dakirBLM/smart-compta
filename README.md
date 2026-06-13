# Smart Compta

Plateforme de gestion comptable bilingue (Français / العربية) avec deux rôles :
**Comptable** et **Client**. Scan de factures via IA (webhook), journaux,
balance, compte de résultat, grand livre et tableau de bord.

- **Backend** : Django + Django REST Framework + SQLite, auth JWT.
- **Frontend** : Next.js 14 (App Router) + TypeScript + Tailwind + React Hook Form + Zod + Recharts.
- **IA** : Next/Django envoient l'image de la facture à un webhook (`WEBHOOK_URL`),
  reçoivent le JSON d'extraction, le valident (`débit == crédit`, confiance, erreurs)
  puis créent l'écriture comptable.

```
acount/
├── backend/    # Django REST API (port 8000)
└── frontend/   # Next.js app (port 3000)
```

## 1. Backend (Django)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # ajustez WEBHOOK_URL si besoin
python manage.py migrate
python manage.py seed         # crée des comptes + données de démo
python manage.py runserver 8000
```

Comptes de démo créés par `seed` :

| Rôle      | Identifiant | Mot de passe |
|-----------|-------------|--------------|
| Comptable | `comptable` | `comptable`  |
| Client    | `client`    | `client`     |

## 2. Frontend (Next.js)

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev                   # http://localhost:3000
```

Ouvrez http://localhost:3000 → connexion → redirection selon le rôle
(`/accountant/dashboard` ou `/client/dashboard`).

## 3. Le webhook IA

`WEBHOOK_URL` est **uniquement** côté serveur (jamais exposé au client).

Flux : `Next.js (image)` → `Django POST /api/scanner/upload/` → `WEBHOOK_URL`
→ JSON d'extraction → validation → `POST /api/scanner/confirm/` → écriture créée.

Le webhook doit répondre **synchroniquement** avec le JSON d'extraction
(structure ci-dessous). Les réponses entourées de balises ```` ```json ```` sont
tolérées (les fences sont retirées avant parsing). Sur Make.com, le scénario
doit se terminer par un module **Webhook Response** (`Content-Type: application/json`).

```json
{
  "fournisseur": "SARL ABC",
  "date_facture": "15/05/2024",
  "numero_facture": "F2024-0158",
  "montant_ht": 100000.00,
  "tva_pourcentage": 19,
  "montant_tva": 19000.00,
  "montant_ttc": 119000.00,
  "journal": "Achats",
  "confiance": 95,
  "lignes": [
    { "compte": "6011",  "libelle": "Achats de marchandises", "debit": 100000.00, "credit": 0.00 },
    { "compte": "44566", "libelle": "TVA déductible",          "debit": 19000.00,  "credit": 0.00 },
    { "compte": "4011",  "libelle": "Fournisseurs",            "debit": 0.00,      "credit": 119000.00 }
  ],
  "statut": "en_cours",
  "erreurs": []
}
```

Règles de validation (back + front) :
- `confiance >= 90` → auto-validation (bouton vert).
- `confiance 60–89` → avertissement jaune, vérification requise.
- `confiance < 60` → alerte rouge, révision manuelle complète.
- `erreurs` non vide → soumission bloquée.
- Total débit == total crédit (validé partout).

### Webhook de démonstration local

Sans service IA réel, pointez `WEBHOOK_URL` vers le mock intégré pour tester
tout le flux scanner :

```
WEBHOOK_URL=http://localhost:8000/api/scanner/mock-webhook/
```

## API REST (résumé)

| Méthode | Endpoint | Rôle |
|--------|----------|------|
| POST | `/api/auth/login/` `/logout/` `/me/` | — |
| GET/POST | `/api/entreprises/` | Comptable |
| GET/PUT/DELETE | `/api/entreprises/:id/` | Comptable |
| GET/POST/DELETE | `/api/entreprises/:id/clients/...` | Comptable |
| GET/POST | `/api/entreprises/:id/exercices/` | Comptable |
| GET/POST | `/api/entreprises/:id/journaux/...` | Comptable |
| GET/POST | `.../journaux/:journalId/ecritures/` | Comptable |
| PUT/DELETE | `/api/ecritures/:id/` | Comptable |
| POST | `/api/scanner/upload/` `/confirm/` | — / Comptable |
| GET/POST/GET | `/api/factures/...` | Client + Comptable |
| GET | `/api/entreprises/:id/balance/` `/compte-resultat/` `/grand-livre/` `/dashboard/` | Comptable |

## Notes

- Montants en **DZD**, formatés `1 234 567,00 DZD`. Dates en `JJ/MM/AAAA`.
- `NIF`, `NIS`, `exercice_comptable` sont **verrouillés** après création
  (champs rouges en modification, ignorés côté serveur).
- Bascule de langue FR/AR instantanée, avec passage en RTL pour l'arabe.
- Tableaux exportables en PDF (Balance, Grand Livre).
- Le client ne voit que ses propres factures ; le comptable voit tous ses clients.
- Interface responsive (les clients utilisent un téléphone).
```
