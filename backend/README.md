# Baaki backend

Baaki is an Express API using JavaScript ES modules and Supabase Auth/PostgreSQL. Money amounts are stored as integer INR paise. This repository starts with the secure business/customer/invoice/payment/cash-flow core; it does not claim that every proposed specification endpoint or external integration is complete.

## Prerequisites

- Node.js 20 or newer and npm. When running the frontend too, use Node.js 20.19 or newer (or 22.12 or newer) to satisfy Vite 8.
- A Supabase project with Auth enabled.
- Supabase CLI only if applying migrations from the command line.

## Install

```powershell
npm install
```

No lockfile was present when this implementation was inspected. `npm install` will generate `package-lock.json`; commit it after reviewing it so future installations can use `npm ci`.

## Environment setup

Copy `.env.example` to `.env`, then set the required Supabase values. The application validates configuration at startup; empty values are accepted only for optional settings. Never commit `.env` or put server secrets in `public/`.

| Variable | Required | Purpose and source |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test`, or `production`; defaults to `development`. |
| `PORT` | No | HTTP port from 1 to 65535; defaults to `3000`. |
| `APP_BASE_URL` | No | Public/base HTTP(S) URL of this API; defaults to `http://localhost:3000`. |
| `FRONTEND_ORIGINS` | No | Comma-separated HTTP(S) origins allowed by CORS. In development only, the backend defaults to the local Vite origins on port 5173 when this is empty. Set explicit origins in production. |
| `SUPABASE_URL` | Yes | Supabase project URL from the dashboard's project API settings. `.env.example` contains a placeholder only. |
| `SUPABASE_ANON_KEY` | Yes | Supabase project API key. Use a legacy `anon` key or a `sb_publishable_...` key accepted by this client path. |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Server-only privileged key used by signed callbacks and authorized invoice-PDF metadata/storage cleanup. The legacy `service_role` key works; a compatible `sb_secret_...` key can be placed in this variable without renaming the application contract. |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | No | Razorpay API credentials from the Razorpay dashboard; configure both or neither. Payment-link creation is not implemented yet. |
| `RAZORPAY_WEBHOOK_SECRET` | No | Secret configured for the Razorpay webhook endpoint; only needed to verify those callbacks. |
| `N8N_BASE_URL` | No | Base URL for the n8n instance; reminder scheduling is not implemented. |
| `N8N_WEBHOOK_SECRET` | No | Shared secret for signed n8n delivery-status callbacks. |
| `ML_VOICE_SERVICE_URL`, `ML_STRATEGY_SERVICE_URL` | No | URLs of the corresponding ML services; leave blank until the service contracts are supplied. |
| `ML_SERVICE_AUTH_TOKEN` | No | Optional server-to-server token for configured ML endpoints. |
| `LOG_LEVEL` | No | Pino log level; defaults to `info`. |

The Supabase project API key and a user's access token are different credentials. The project key identifies the project; protected requests must carry a user JWT in `Authorization: Bearer <access-token>`, which the backend verifies through Supabase Auth. A publishable key is not a user identity or access token. Configuration validation errors omit values, and the application logger redacts configured Supabase, Razorpay, n8n, and ML secrets.

The variable name `SUPABASE_SERVICE_ROLE_KEY` is retained for compatibility with the backend contract and refers to a privileged server-side key. If migrating from a legacy service-role key to a dashboard `sb_secret_...` key, put the new key in this same variable; do not add a client-side alias or expose either key. Privileged access is confined to authenticated server-side callback processing and PDF metadata/failed-upload cleanup; it is not a substitute for user authorization or RLS. Supabase Storage upload/download uses the caller's user-scoped JWT. Do not set `SUPABASE_SECRET_KEY` or `SUPABASE_PUBLISHABLE_KEY`; the validator rejects these aliases and directs you to the canonical names.

For local development:

1. Copy `.env.example` to `.env` (for example, `Copy-Item .env.example .env` in PowerShell). If `.env` already exists, preserve it and update only the values you intend to change.
2. Add the Supabase project URL and a project API key from the Supabase dashboard. Use a development project, not production.
3. Leave `SUPABASE_SERVICE_ROLE_KEY` and provider settings empty unless exercising their specific server-side functionality.
4. Run tests with `npm test`; the suite uses dummy credentials and mocks and must not contact Supabase, Razorpay, n8n, or ML services.

The core server requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Razorpay, n8n, and ML integrations can remain unconfigured; features requiring them report configuration errors rather than returning simulated success. The HTML test console is served from the API origin and never receives privileged keys.

## Database migrations

The migrations are in `supabase/migrations/`. The initial schema is in `202610240001_initial_schema.sql`; `202610250001_invoice_documents.sql` adds issue-time invoice snapshots, financial-year numbering, invoice event/document metadata, and private Storage policies.

For a linked Supabase project:

```powershell
supabase init
supabase link --project-ref YOUR_PROJECT_REF
supabase migration list
supabase db push
```

If an API request reports `DATABASE_ERROR`, inspect the backend log entry with the same request ID. Database diagnostics include the method, route, operation, table, Supabase error code, and sanitized message. Details and hints are logged only when they match known schema-only formats; authorization headers, tokens, request bodies, and row values are not logged or returned to the client. A `PGRST205` response for an expected table means the project does not currently expose that table through PostgREST. Verify the linked project reference and migration history before applying migrations; use `supabase db push` to apply pending versioned migrations, and do not use `supabase db reset` against a hosted project.

For local Supabase development, run `supabase init` once if the CLI project configuration is absent, then start the local stack and apply migrations with `supabase db reset`. Together the migrations create businesses, customers, invoices and items, payments and allocations, cash-flow data, collection/reminder support tables, audit/idempotency records, RLS policies, atomic invoice/payment RPCs, and the invoice-document additions described above. They do not insert fake users or financial records.

## Start the backend

```powershell
npm run dev
```

The production start command is `npm start`. Liveness is at `http://localhost:3000/health`; readiness is at `http://localhost:3000/ready`. Readiness checks Supabase Auth and PostgREST reachability without requesting its service-role-only OpenAPI document. It does not verify that application migrations have been applied.

The React frontend is in `../Frontend`. In its separate terminal, run `npm install`, copy `../Frontend/.env.example` to `../Frontend/.env`, set the Supabase public values and `VITE_API_BASE_URL=http://localhost:3000/api/v1`, then run `npm run dev`. Vite uses port 5173 by default. Configure `FRONTEND_ORIGINS` to the exact Vite origin if using a different port.

## HTML testing frontend

Open `http://localhost:3000/`. The page is plain HTML with minimal vanilla JavaScript, keeps the pasted token in page memory only, and can call the implemented routes. It displays unavailable areas as not implemented rather than fabricating results.

## Testing protected routes

Sign in using the Supabase Auth flow in your application and paste the resulting access token into the test console. The API verifies the token with Supabase Auth and resolves the one business for that authenticated user; client-provided owner/business IDs are not used for authorization.

Example:

```powershell
curl.exe -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" http://localhost:3000/api/v1/businesses/current
```

Invoice draft creation and payment recording require an `Idempotency-Key` header. The HTML console generates a fresh key for those operations. Request monetary amounts in integer paise; invoice quantities use thousandths (`quantityMilli`), and tax/discount rates use basis points.

## Automated checks

```powershell
npm test
npm run lint
```

Tests use dummy Supabase settings and test webhook secrets, including environment parsing, user-token verification, route protection, and configured CORS; they do not connect to real providers or send reminders/payments.

## API documentation

- Swagger UI: `/docs`
- OpenAPI JSON: `/openapi.json`

OpenAPI describes the currently implemented subset, not the entire pre-implementation inventory.

## Currently implemented endpoints

- System: `GET /health`, `GET /ready`, `GET /docs`, `GET /openapi.json`.
- Auth/business: `GET /api/v1/auth/me`, `POST /api/v1/businesses`, `GET/PATCH /api/v1/businesses/current`.
- Customers: create, list/search, get, update, archive, customer invoice/payment lists and ledger.
- Invoices: backend preview, idempotent draft creation, date/status/customer/financial-year filtering, list/get, draft update, issue and eligible cancellation, escaped plain-HTML print preview, issued snapshot PDF, UPI QR, document metadata/download, and invoice timeline.
- Payments: idempotent manual/offline payment recording, list/get, idempotent allocations and allocation listing.
- Cash flow: cash snapshots, expected entries, deterministic forecast, saved latest forecast and shortage/gap risks.
- Webhooks: signed Razorpay events are verified and recorded for deduplication but **not reconciled to payments yet**. Signed n8n delivery callbacks update reminder delivery status when service-role configuration exists; they cannot update invoice/payment state.

## External integrations and limitations

- **Razorpay:** `RAZORPAY_WEBHOOK_SECRET` enables signature verification. `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, payment-link creation, refunds and verified event-to-payment reconciliation remain unimplemented. A stored webhook is explicitly reported as received but not processed.
- **n8n:** `N8N_WEBHOOK_SECRET` and server-only `SUPABASE_SERVICE_ROLE_KEY` enable the signed delivery-status callback. Reminder creation, delivery scheduling, retries and cancellation are not implemented.
- **ML models:** Dedicated adapter interfaces are in `src/integrations/ml/modelService.client.js`. `ML_VOICE_SERVICE_URL`, `ML_STRATEGY_SERVICE_URL`, and `ML_SERVICE_AUTH_TOKEN` are validated configuration fields, but the endpoint, authentication scheme, payloads, response schemas, timeouts, and retry behavior have not been supplied or verified. The adapters make no network calls and return `503 MODEL_CONTRACT_UNAVAILABLE` if invoked after a URL is configured; a missing URL returns `503 MODEL_SERVICE_NOT_CONFIGURED`. Supply each model's contract before enabling a call path. No model output is fabricated, sensitive data or credentials are not logged, and no OpenAI API is used.
- **Invoice documents:** New issues snapshot seller, buyer, line items, totals, issue date, invoice number, and Indian financial-year identifier in the issue transaction. New invoice numbers use the `YYYY-YY-000001` form with April-to-March boundaries. Previously issued invoices are not backfilled with invented snapshots; PDF generation reports that the historical snapshot is unavailable. Invoice PDFs use a private Supabase Storage bucket, tenant-scoped storage policy, metadata records, SHA-256, and 5-minute signed URLs. PDF generation requires `SUPABASE_SERVICE_ROLE_KEY` for server-only metadata insertion, and reports a clear configuration error when absent. No arbitrary evidence upload API is exposed yet.
- **UPI:** QR payloads use only the issue-time `invoice_settings.upiVpa` and `upiDisplayName`, and the server-derived outstanding balance. Configure those business settings explicitly. QR generation does not record or confirm a payment.
- **GST:** The module still supports only generic explicit per-line rates and does not validate GSTINs, GST invoice types, place of supply, or CGST/SGST versus IGST. Generated documents are not represented as GST-compliant. Confirm facts and obtain professional review before using them as tax invoices.
- **Delivery and demand letters:** Email/n8n invoice delivery, delivery attempt tracking, demand-letter generation/sending, and public invoice links remain unimplemented. No delivery is claimed from a webhook 200 response.
- **Public pages, dashboard, reports, CSV export, refunds, payment void, profile mutation and account deletion:** not implemented.
- GST calculations support percentage-based rates with per-line half-up paise rounding, but GST inclusive pricing, place-of-supply rules, statutory invoice fields, and legal compliance have not been confirmed or verified.
- Reminder consent/opt-out, public token expiry/revocation, refund/credit-note/overpayment policy, retention and fiscal-year numbering remain product decisions.

## Validation status for this initial workspace implementation

The command `node --version; npm --version; npm install` was attempted but PowerShell could not start it. The exact sandbox error was: `Cannot start sandboxed command: Sandboxed commands cannot reach the local proxy because local network access is disabled.` No Node/npm version was obtained, and installation, tests, lint, startup, and migrations have not run.

VS Code test discovery previously reported `Registered VS Code test controllers: 0`; no automated test results are available. The repository currently defines 43 unit/integration test cases, including environment, Supabase client, authentication, log-redaction, invoice-document, and ML-adapter regressions. No passing test, lint, startup, or migration result is claimed. Enable local network access for this workspace sandbox, then install dependencies, run `npm test` and `npm run lint`, and configure a development Supabase project before applying migrations.
