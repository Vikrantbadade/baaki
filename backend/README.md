# Baaki backend

Baaki is an Express 5 API using JavaScript ES modules, Zod, and a local PostgreSQL database. Monetary amounts are stored as integer paise. The local runtime does not require Supabase services or credentials.

## Prerequisites

- Node.js 20 or newer and npm.
- Docker Desktop with Docker Compose v2.

## Local PostgreSQL

The root `docker-compose.yml` runs PostgreSQL 17 Alpine, bound to `127.0.0.1:5432`, with persistent volume storage and a `pg_isready` health check. The container initializes the `baaki` database and a non-superuser application role named `baaki_app`.

Create ignored local credentials from the example, then start the database:

```powershell
Set-Location ..
Copy-Item .env.docker.example .env.docker
# Replace both passwords in .env.docker with different random values.
docker compose up -d db
docker compose ps
docker compose logs -f db
```

Useful database commands:

```powershell
docker compose stop db
docker compose start db
docker compose down
docker compose exec db psql -U baaki_app -d baaki
```

`docker compose down` stops and removes the container but preserves the named volume. Do not use `docker compose down -v` unless intentionally deleting the local database.

The Docker initialization script creates `baaki_app` on first initialization only. If an existing local data volume predates this setup, do not reset it; inspect it and create/grant the role manually as appropriate.

## Backend setup

Install dependencies and copy the backend environment example:

```powershell
Set-Location .\backend
npm ci
Copy-Item .env.example .env
```

Set `DATABASE_URL` to the application-role connection URL and set `JWT_SECRET` to a unique random value of at least 32 characters. Keep `.env` private and never place this secret in a `VITE_` variable.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL URL for the local `baaki_app` role. |
| `JWT_SECRET` | Yes | Secret used to sign and verify access JWTs; generate a strong random value. |
| `JWT_ACCESS_TOKEN_TTL` | No | Short-lived token duration such as `30m`; defaults to `30m`. |
| `NODE_ENV`, `PORT`, `APP_BASE_URL`, `FRONTEND_ORIGINS` | No | Runtime mode, port, public API base, and allowed frontend origins. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | No | Optional Razorpay integration configuration. |
| `N8N_BASE_URL` | When enabled | Complete HTTPS n8n webhook URL; do not append a path or webhook ID. |
| `N8N_ENABLED` | No | Enables best-effort collection-reminder events; defaults to `false` unless set to `true`. |
| `N8N_TIMEOUT_MS` | No | Outbound webhook timeout from 1,000 to 60,000 ms; defaults to `15,000`. |
| `N8N_WEBHOOK_SECRET` | Only for callbacks | Shared HMAC secret for inbound n8n delivery-status callbacks; it is not sent to the public outbound webhook. |
| `ML_VOICE_SERVICE_URL`, `ML_STRATEGY_SERVICE_URL`, `ML_SERVICE_AUTH_TOKEN` | No | Optional model-service configuration; the native Node planner and voice parsing remain available. |
| `INVOICE_DOCUMENTS_DIRECTORY` | No | Private local PDF directory; defaults to `backend/storage/invoice-documents`. |
| `LOG_LEVEL` | No | Pino log level; defaults to `info`. |

## Migrations

Active plain-PostgreSQL migrations are under `migrations/`. The runner creates `public.schema_migrations`, applies ordered migration files transactionally, records successful versions, and safely skips recorded versions:

```powershell
npm run db:migrate
```

The active migrations create local users and revocable auth sessions; business, customer, invoice, payment, cash-flow, collection-planning, reminder, audit, idempotency, and invoice-document tables; constraints and indexes; and native PostgreSQL functions/triggers for the existing transactional operations. No seed or demo financial data is inserted.

The files under `supabase/migrations/` are retained as historical hosted-project migrations and are not used by the local runner. The remote Supabase project is not modified.

## Start the application

Start PostgreSQL and apply migrations first, then run:

```powershell
npm run db:migrate
npm run dev
```

The API listens on port 3000 by default. Liveness is `http://localhost:3000/health`; readiness checks local PostgreSQL at `http://localhost:3000/ready`; API documentation is at `http://localhost:3000/docs`.

In a second terminal, configure `Frontend/.env` with `VITE_API_BASE_URL=http://localhost:3000/api/v1`, then run `npm install` and `npm run dev` from `Frontend`. Vite defaults to port 5173.

## Authentication and data isolation

Registration and login use `POST /api/v1/auth/register` and `POST /api/v1/auth/login`. Passwords are bcrypt-hashed; only hashes are stored. The API issues short-lived signed JWTs and checks the corresponding unexpired, non-revoked session in PostgreSQL for each protected request. Logout revokes the session. The browser stores the access token locally and sends it only to the API as a bearer token.

All business records are scoped using the business resolved from the verified JWT subject. Client-provided owner IDs are not used as authorization proof. Invoice/payment mutations continue to use database functions and transactions; collection-plan plus item writes and plan execution/reminder writes are transactional.

Password-reset email delivery is unavailable until a mail provider and reset-token flow are configured. A protected password update is available to a signed-in user. No fake reset-email success is returned.

## n8n collection-reminder integration

When an authenticated owner executes an approved collection plan with `POST /api/v1/collection-plans/{planId}/execute`, Baaki first commits the plan and pending reminders in PostgreSQL. It then sends one best-effort HTTPS `POST` to the exact `N8N_BASE_URL`; the frontend never calls n8n. The configured URL is treated as the complete webhook endpoint. Redirects are rejected, requests time out, and Baaki does not retry POSTs. An n8n failure is reported separately in the response's `automation` field and does not roll back already committed reminders or financial records.

Set `N8N_ENABLED=true`, configure the complete `N8N_BASE_URL`, and restart the backend to enable delivery. `N8N_TIMEOUT_MS` defaults to 15 seconds. The supplied published webhook is configured in `.env.example`; it is public, so Baaki sends no authentication header. `N8N_WEBHOOK_SECRET` is used only to authenticate inbound delivery-status callbacks, not for outbound requests. The existing callback requires n8n to send `x-n8n-signature`, an HMAC-SHA256 hex digest of the exact raw request body, using the same callback secret.

Baaki's version 1 outbound contract is:

```json
{
  "eventId": "collection-plan:<plan-uuid>:reminders:v1",
  "eventType": "collection_plan.reminders_requested",
  "version": 1,
  "occurredAt": "2026-10-25T14:00:00.000Z",
  "businessId": "<authenticated-business-uuid>",
  "data": {
    "collectionPlanId": "<collection-plan-uuid>",
    "reminders": [
      {
        "reminderId": "<reminder-uuid>",
        "invoiceId": "<invoice-uuid>",
        "channel": "whatsapp",
        "scheduledAt": "2026-10-25T14:00:00.000Z"
      }
    ]
  }
}
```

The business ID comes from the verified user's business context. The event intentionally contains only identifiers, channel, and schedule—not customer contact details, invoice amounts, credentials, or tokens. A `2xx` response (including an empty body or plain-text response) is treated as accepted; a non-2xx response, timeout, network failure, or malformed JSON response is normalized to a safe `automation.status: "failed"` result. Successful response bodies are not returned to the browser.

**Workflow contract limitation:** the n8n workflow definition was not present in the repository and has not been inspected or invoked. Therefore, compatibility of the published workflow with the version 1 event above is not verified. Configure the n8n Webhook node to accept this JSON shape and configure a response node to return `2xx`. The workflow must perform its own deduplication using `eventId` before triggering side effects. If it needs customer contact or invoice details, do not add those to this event until the workflow's purpose, minimum required fields, and privacy handling are reviewed.

There is no durable outbox/queue. Delivery is synchronous and best-effort after the database transaction; if n8n is unavailable, reminders remain committed and pending, but Baaki does not automatically retry them. The deterministic event ID supports workflow-side deduplication, but no local delivery ledger is currently persisted.

Run `npm test` to exercise the integration with mocked HTTP responses; tests never call the production webhook. For manual end-to-end verification, point `N8N_BASE_URL` at a separate HTTPS test webhook with the same contract, enable n8n, execute an approved test plan using an authenticated account, and confirm the workflow receives the event once. Do not test against the production webhook until its nodes and side effects are confirmed. Check the returned `automation.status` and sanitized backend logs when troubleshooting. `N8N_TIMEOUT` indicates the configured request deadline; `N8N_UPSTREAM_ERROR` indicates a non-2xx response; `N8N_NETWORK_ERROR` indicates a connection failure; `N8N_INVALID_RESPONSE` indicates malformed JSON with a JSON content type. No upstream body or sensitive event data is logged.

## Tests and operational notes

Run unit/API tests and lint with:

```powershell
npm test
npm run lint
```

The PostgreSQL integration suite is enabled only when `TEST_DATABASE_URL` points to a loopback host and a database name ending in `_test`. Create a separate local test database and run it with:

```powershell
docker compose exec db createdb -U postgres -O baaki_app baaki_test
$databaseUrl = (Get-Content .env | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1).Substring(13)
$env:TEST_DATABASE_URL = $databaseUrl -replace '/baaki$', '/baaki_test'
npm test
Remove-Item Env:TEST_DATABASE_URL
```

The suite applies migrations and deletes only rows bearing its generated integration-test IDs. Do not point tests at a hosted or production database.

Invoice PDFs are stored privately on the local filesystem with restrictive file permissions. Download links use hashed, short-lived, single-use tokens after a server-side business-scoped lookup. Back up the document directory and PostgreSQL volume together.

The optional Python ML service remains separate. Native Node.js collection planning and English/Hindi/Hinglish transcript interpretation continue to operate when the optional service is not configured. No algorithm changes are intended by this database migration.
