# Comptia — Agent Guide

## Project overview

Comptia (also called Smart Compta in deployment files) is a French/Arabic
accounting app for Algerian businesses. Accountants manage companies,
transactions, invoices, and reports; clients use a company-linked portal for
invoice submissions, invoice viewing, and messages.

- **Frontend:** Next.js 14 App Router, React 18, TypeScript, Tailwind,
  React Hook Form/Zod, Recharts.
- **Backend:** Django 4.2 and Django REST Framework; `accounts/` handles users
  and auth, `core/` handles accounting and business APIs.
- **Data/files:** SQLite by default; `DATABASE_URL` configures another database
  (deployment docs describe PostgreSQL). Django migrations manage schema.
  Media is local unless Cloudinary is configured.
- **Integrations/deployment:** Django calls synchronous `WEBHOOK_URL` for AI
  extraction; an optional Next.js bridge also exists. `render.yaml` configures
  Render; `DEPLOY.md` documents Neon/Render/Vercel.

Flow: browser → Next.js → JWT-authenticated Django API → database/webhook.
Frontend guards do not replace backend authorization or company scoping.
Webhook provider, production credentials, active deployment, and runtime data
are not verifiable from this repository.

## Mandatory pre-work interview

Before any code change, inspect the relevant implementation. If requirements,
expected behavior, scope, or business rules are still unclear, ask concise
questions and wait for the user’s answer before coding. Do not ask what the
task or repository already answers. Clarify as relevant:

- What must change, and what should stay the same?
- Which roles, workflows, inputs, outputs, and edge cases are affected?
- Which accounting/business rules must be preserved?
- Which implementation or data source is authoritative?
- Which tests or acceptance criteria define success?

## Repository structure and important files

Generated output, local databases, environments, `node_modules`, and build
artifacts are omitted. `frontend/next-env.d.ts` is generated; do not edit it
manually.

```text
.
├── README.md, DEPLOY.md, render.yaml     Setup, deployment, Render config
├── backend/
│   ├── manage.py, requirements.txt, .env.example
│   ├── smartcompta/                     Django settings, root URLs, ASGI/WSGI
│   ├── accounts/                        User model, auth API, migrations
│   ├── core/                            Domain, API, services, tests, migrations
│   │   └── management/commands/         Seed, SCF import/sync, maintenance
│   ├── data/LA_TABLE_SCF.csv            SCF reference data
│   └── scripts/                         SCF checking utility
└── frontend/
    ├── package.json, next.config.js, tsconfig.json, tailwind.config.ts
    ├── app/                              Public, auth, accountant/client routes, webhook
    ├── components/                       Shared shells, forms, scanners, tables, UI
    ├── lib/                              API/auth/i18n, types, utilities, PDF
    ├── public/                           Brand assets and OpenCV script
    └── types/                            Third-party declarations
```

Key backend files: `smartcompta/settings.py` (database, JWT/DRF, CORS, storage,
webhook); `accounts/models.py`, `serializers.py`, `views.py`, `urls.py`
(roles/auth); `core/models.py`, `urls.py`, `views.py`, `serializers.py`
(entities, endpoints, validation); `permissions.py` (role checks);
`account_helpers.py` and `signals.py` (401/411 tiers and SCF sync);
`scanner.py` and `bank_statements.py` (extraction/import); `reports.py`
(calculations); `tests.py` and `tests_bank.py` (backend regression tests).

Key frontend files: `lib/api.ts` (API/JWT client), `auth-context.tsx`, `types.ts`,
`i18n.ts` and `i18n-context.tsx` (auth, API shapes, localization);
`components/RoleGuard.tsx`, `AppShell.tsx`, `ClientShell.tsx` (route layouts);
`ScannerFlow.tsx`, `ClientScanner.tsx`, `BankStatementFlow.tsx` (capture/review);
`EcritureForm.tsx`, `JournalTable.tsx` (ledger UI);
`ReportActions.tsx`, `lib/pdf.ts` (print/PDF); `app/api/webhook/route.ts`
(optional server-side bridge).

`app/accountant/` contains portfolio/company, journals, clients, suppliers,
invoices, scanner, SCF, messages, and reports (`balance`, `bilan`,
`compte-resultat`, `grand-livre`, dashboards). `app/client/` contains dashboard,
invoices, scanner, messages, and settings. `app/(auth)/` contains login and
accountant registration. Company pages share `[id]`; journal detail uses
`journaux/[journalId]`.

Account migrations define the custom user/photo; core migrations evolve the
accounting schema, SCF data, invoice rules, and bank statements. There are two
parallel core `0002` migrations followed by a merge migration. Read migration
dependencies and operations before changing schema; do not edit generated files.

## Feature-to-file mapping

API paths below are relative to `/api/`; route declarations live in
`accounts/urls.py` and `core/urls.py`.

| Feature | Frontend | Backend and data flow | Tests |
|---|---|---|---|
| Authentication/authorization | `(auth)/login`, `(auth)/register`, `lib/auth-context.tsx`, `RoleGuard.tsx`, accountant profile | `/auth/{login,register,logout,me}/`; custom `accounts.User`. Public registration creates accountants; company client-access workflow creates portal users. DRF defaults to authenticated access. | No dedicated accounts test module found. |
| Companies/years | `app/accountant/entreprises/`, accountant dashboard, `EntrepriseForm`, `useEntreprise.ts` | `/entreprises/`, `/<id>/`, `/<id>/exercices/`; `Entreprise` owns `ExerciceAnnee`; views scope companies to their accountant. | Core tests. |
| Clients/suppliers | Company `clients/`, `fournisseurs/` pages | `/clients/` is portal `ClientAccess`; `/clients-comptables/` is ledger clients (`ClientComptable`, 411); `/fournisseurs/` is `Fournisseur` (401). Helpers allocate tiers; signals update company SCF. | Core tier/SCF and invoice tests. |
| Transactions/journals | Company `journaux/`, journal detail, `EcritureForm`, `JournalTable` | `/journaux/`, `/journaux/<id>/ecritures/`, `/ecritures/<id>/`; `Journal → Ecriture → LigneEcriture`. Serializer validates SCF accounts and debit/credit equality within 0.01. | `core/tests.py`, `tests_bank.py`. |
| Invoices/scanning | Accountant company invoices/scanner; client scanner/invoices; `ScannerFlow`, `ClientScanner`, `InvoiceCard` | `/scanner/upload/` extracts; accountant-only `/scanner/confirm/` persists entry/invoice. `/factures/`, `/<id>/`, `/<id>/validate/` handle scoped submission, listing, deletion, and validation. `Facture` may link to `Ecriture`; core views handle duplicates/reuse. PDF/JPG/JPEG/PNG supported; verify current limits in code. | Core ownership, validation, deletion, reuse, and payment tests. |
| Bank statements | Company `releves-bancaires/`, `BankStatementFlow`, `lib/api.ts` | `/entreprises/<id>/releves-bancaires/{upload,import}/`; validates identity, previews reviewed data, then creates `BankStatement` and journal entries/lines. Helpers classify, deduplicate, resolve SCF, and may create a cash entry for deposits. | `tests_bank.py` and bank cases in `tests.py`. |
| Reports/exports | Accountant dashboard, balance, bilan, income statement, general ledger; `ReportActions` | `/entreprises/<id>/{dashboard,balance,compte-resultat,grand-livre}/`; `reports.py` aggregates ledger lines by company/year; ledger also accepts date bounds. Print and PDF (`jsPDF`/`html2canvas`) run in browser; no CSV/Excel export found. | Report/account-label cases in `core/tests.py`; no frontend test runner configured. |
| SCF | Company `scf/`, `EcritureForm`, frontend types | `/scf/`, `/entreprises/<id>/scf/`; global chart from `LA_TABLE_SCF.csv`, company-specific tiers/subaccounts via helpers, signals, and commands. | SCF/account cases in `core/tests.py`. |
| Messages/localization | Accountant/client messages, `ChatPanel`; `lib/i18n*`, `LanguageToggle` | Conversation/message APIs; `Message` links company, sender, and portal client. Views scope access and mark messages read. French/Arabic and RTL are frontend behavior. | No dedicated message or frontend tests found. |

## Data dependencies and risk assessment

| Area | Dependencies and risks |
|---|---|
| Company and access | `Entreprise` parents fiscal years, journals, tiers, invoices, messages, statements, and company SCF accounts; many foreign keys cascade on deletion. Portal `ClientAccess` is not an accounting tier. |
| Ledger and reports | `ExerciceAnnee → Journal → Ecriture → LigneEcriture`; reports aggregate lines. Preserve balancing, SCF validation, atomicity, decimal calculations, and report totals. Report builders currently do not enable `only_valid`; do not assume draft/rejected entries are excluded. |
| Tiers/SCF | Supplier/client tier numbering and reuse, SCF subaccounts, signals, entry validation, and invoice posting are coupled. |
| Invoices/deletion | `Facture` links company/client and optionally an entry. Invoice API deletion explicitly removes its linked entry; other FK deletion may null the link. Duplicate/reuse and payment matching prevent repeated posting. Preserve intended scope and atomicity. |
| Bank imports | A duplicate requires matching date, reference, label, and amount—not reference alone. Atomic imports create validated balanced entries; some deposits also create cash entries. |
| Extraction | Invoice and bank flows have distinct review/confirmation rules. `scanner._parse_date` falls back to today for invalid dates. Preserve upload validation, PDF conversion, webhook error handling, and server-only secrets. |

Review `core/views.py`, models/serializers, scanner/bank/account helpers,
reports, migrations, `frontend/lib/api.ts`/`types.ts`, and related UI together
when changing these workflows.

## Critical rules for AI agents

- Read relevant implementation, callers, models, serializers, and tests first;
  check both sides of API contracts.
- Preserve accounting rules, API behavior, authorization/company scope,
  relationships, deletion semantics, and French/Arabic conventions unless the
  task explicitly changes them.
- Keep changes scoped. Never silently change schemas, calculations, endpoints,
  or data relationships; use migrations for schema changes.
- Enforce permissions and validation in the backend; frontend guards are not
  authorization.
- Preserve atomicity and duplicate checks in invoice/bank posting; avoid
  repeated processing or unintended data loss.
- Never hardcode or expose `WEBHOOK_URL`, database credentials, or
  `DJANGO_SECRET_KEY`; keep secrets out of client code and `NEXT_PUBLIC_*`.
- Avoid generated/local/dependency files unless required. Add/update relevant
  tests and docs; report assumptions, risks, and checks not run.

## Pre-implementation checklist

1. Understand the task and acceptance criteria.
2. Inspect relevant implementation and dependencies.
3. Obtain necessary clarifications before coding.
4. Understand existing behavior, rules, and affected features/data.
5. Confirm a scoped approach, including API/schema impact.
6. Identify relevant tests and verification commands.

Do not implement while an essential requirement is unresolved.

## Verification and development commands

Commands are from the README, `package.json`, or `render.yaml`. Run within the
component directory; adapt the README’s POSIX environment activation for your
shell.

**Backend (`backend/`):**

```bash
python3 -m venv venv
pip install -r requirements.txt
python manage.py migrate
python manage.py seed
python manage.py runserver 8000
python manage.py test core
```

Render also runs `collectstatic --noinput`, `import_scf`, and
`sync_scf_from_ledger`. No backend lint/type-check command is configured.

**Frontend (`frontend/`):**

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

`start` requires a production build. No frontend test or standalone type-check
script is configured. Environment templates are `backend/.env.example` and
`frontend/.env.local.example`; use `README.md` for local setup and
`DEPLOY.md`/`render.yaml` for deployment. Never document real secret values.

## Keeping this guide accurate

Update this file when architecture, feature locations, data dependencies,
exports, or development workflows materially change. Keep details source-backed
and link to `README.md` or `DEPLOY.md` instead of duplicating their setup
instructions. Announce the guide in the PR or normal team channel so teammates
know it exists.
