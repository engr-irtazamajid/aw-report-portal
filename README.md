# AW Client Report Portal

Internal portal for the Windbrook Solutions team to manage client profiles, enter quarterly balances, auto-calculate cashflow and net-worth math, and generate pixel-stable SACS and TCC PDF reports.

Built per the PRD: takes quarterly report prep from a full day down to under an hour while eliminating manual math errors.

## Stack

| Layer    | Tech                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| Frontend | React 18 + TypeScript, Vite, Tailwind, React Router, TanStack Query, React Hook Form + Zod, Sonner |
| Backend  | FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, passlib + bcrypt, python-jose, slowapi, structlog |
| PDFs     | Jinja2 + WeasyPrint (HTML/CSS → fixed-layout PDFs)                                    |
| DB       | SQLite on disk (volume in prod). Schema is Postgres-compatible.                       |
| Infra    | Docker + docker-compose; nginx for the SPA                                            |

## Highlights

- JWT auth (15 min access, 7 day refresh in HttpOnly+SameSite=Strict cookie) + RBAC (`admin`, `planner`, `assistant`).
- Pydantic input validation, `extra="forbid"` everywhere, no raw SQL.
- SSN last-4 encrypted at rest (Fernet), masked in API responses.
- slowapi rate limit on `POST /auth/login` (5/15 min/IP) plus a default 60/min/IP.
- Strict CSP, HSTS (prod), `X-Frame-Options: DENY`, `Referrer-Policy`, etc.
- Audit log for login, client mutations, report finalize, PDF download.
- Calculations are a single source of truth (`backend/app/services/calculation_service.py`) with parity tests on both sides (`frontend/src/lib/calc.test.ts`, `backend/tests/test_calculation_service.py`).

## Project layout

```
aw-report-portal/
├── backend/
│   ├── app/
│   │   ├── api/v1/        REST routes
│   │   ├── core/          config, security, logging, rate limit, middleware, exceptions
│   │   ├── db/            base + migrations
│   │   ├── models/        SQLAlchemy ORM
│   │   ├── schemas/       Pydantic DTOs
│   │   ├── repositories/  DB access layer
│   │   ├── services/      auth, client, report, calculation, pdf, audit
│   │   └── templates/     sacs.html, tcc.html, base.css
│   ├── tests/             pytest unit + integration
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/           axios client + typed endpoints
│   │   ├── auth/          AuthContext, ProtectedRoute, useAuth
│   │   ├── components/    ui/, layout/
│   │   ├── features/      auth/, clients/, reports/
│   │   ├── lib/           calc.ts (mirrors backend), format.ts, validation/
│   │   └── types/
│   ├── Dockerfile
│   └── nginx.conf
└── docker-compose.yml
```

## Run locally (without Docker)

### 1. Backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# Edit .env and set a strong JWT_SECRET (>= 16 chars, not the placeholder).
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000
```

The first run seeds an admin user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api/*` to `http://localhost:8000`.

## Run with Docker

```bash
export JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
export SEED_ADMIN_PASSWORD="ChangeMeNow!2026"
docker compose up --build
```

- Frontend: <http://localhost:8080>
- Backend: <http://localhost:8000/api/health>

The backend container runs `alembic upgrade head` on startup and persists SQLite + PDFs to the `portal_data` volume.

## Tests, lint, security

```bash
# Backend
cd backend
.venv/bin/ruff check app tests          # lint
.venv/bin/bandit -r app --severity-level medium  # security scan
.venv/bin/pytest -q                     # 21 tests

# Frontend
cd frontend
npm run lint                            # ESLint, --max-warnings=0
npx tsc -b                              # strict TS
npm test                                # vitest
npm run build                           # production build
```

Backend tests cover the calculation service (12 cases), Canva integration (5 cases), the auth flow, RBAC, end-to-end client + report + PDF generation, and finalize idempotency. Frontend tests prove the live-preview calculator matches the backend.

## CI/CD

`.github/workflows/ci.yml` runs on every push and PR to `main`:

- **Backend job** — installs WeasyPrint system deps, runs `ruff`, `bandit`, and `pytest`.
- **Frontend job** — `npm ci`, `tsc`, `eslint`, `vitest`, `vite build`.
- **Docker job** — gated on the two above; builds both production images to catch container regressions.

`.github/workflows/codeql.yml` runs CodeQL on Python and TypeScript on every push, PR, and weekly schedule.

`.github/dependabot.yml` keeps pip, npm, and GitHub Actions dependencies up to date with weekly grouped PRs.

## API

All endpoints live under `/api/v1` and require `Authorization: Bearer <access_token>` (except `POST /auth/login` and `POST /auth/refresh`).

| Method | Path                                | Purpose                                        |
| ------ | ----------------------------------- | ---------------------------------------------- |
| POST   | `/auth/login`                       | Issue access + refresh (cookie)                |
| POST   | `/auth/refresh`                     | Rotate access token from refresh cookie        |
| POST   | `/auth/logout`                      | Clear refresh cookie                           |
| GET    | `/auth/me`                          | Current user                                   |
| GET    | `/clients`                          | List clients with last-report timestamp        |
| POST   | `/clients`                          | Create client + nested resources               |
| GET    | `/clients/{id}`                     | Client detail (SSN masked)                     |
| PUT    | `/clients/{id}`                     | Update client + nested resources               |
| DELETE | `/clients/{id}`                     | Delete client (admin/planner only)             |
| GET    | `/clients/{id}/last-balances`       | Map of last finalized balances for pre-fill    |
| POST   | `/clients/{id}/reports`             | Create draft report                            |
| GET    | `/clients/{id}/reports`             | Report history for a client                    |
| GET    | `/reports/{id}`                     | Report snapshot with totals                    |
| POST   | `/reports/{id}/finalize`            | Lock snapshot, render PDFs                     |
| GET    | `/reports/{id}/pdf?type=sacs\|tcc`  | Stream PDF                                     |
| GET    | `/integrations/canva/status`        | Whether Canva export is enabled                |
| POST   | `/reports/{id}/export/canva?type=…` | Upload the rendered PDF to Canva, return URL   |

OpenAPI docs at `/api/docs` in non-production environments.

### Canva export (optional)

Per the PRD this is a nice-to-have. Set `CANVA_API_KEY` in the backend `.env` to a Canva Connect API token and the **Edit SACS/TCC in Canva** buttons appear in the report detail page. The integration uses the documented [Canva Asset Upload API](https://www.canva.dev/docs/connect/api-reference/asset-uploads/) — the backend uploads the finalized PDF, polls until processed, and returns an edit URL. Without a key, the endpoint responds `503 canva_not_configured` and the UI hides the button.

## Calculation rules (single source of truth)

- SACS Excess = `inflow - outflow`
- SACS Private Reserve Target = `6 × outflow + Σ insurance deductibles` (override on profile wins)
- TCC Client 1 Retirement = Σ `primary` retirement accounts
- TCC Client 2 Retirement = Σ `spouse` retirement accounts
- TCC Non-Retirement = Σ all non-retirement accounts (joint included, trust excluded)
- TCC Grand Total = Client 1 Retirement + Client 2 Retirement + Non-Retirement + Trust
- TCC Liabilities Total = Σ liabilities, reported separately — **never subtracted** from net worth

These rules are pulled directly from the PRD and the customer transcript (Rebecca 24:28, 26:15).

## Security checklist

- [x] bcrypt password hashing (cost 12)
- [x] JWT HS256 access + refresh; refresh in `HttpOnly` + `SameSite=Strict` cookie
- [x] Rate limit on `/auth/login` (5/15 min/IP)
- [x] Strict CSP, HSTS (prod), X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [x] CORS locked to configured origins
- [x] Pydantic `extra="forbid"` on every payload
- [x] SSN last-4 encrypted at rest (Fernet) and masked in responses
- [x] SQLAlchemy parameterized queries (no string SQL)
- [x] Jinja2 autoescape on PDF templates, React escapes by default
- [x] Audit log on login (success/fail), client mutations, finalize, PDF download
- [x] Structured JSON logs with request-id, no PII
