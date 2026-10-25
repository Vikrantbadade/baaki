# Baaki Frontend

Baaki's browser application is React 19, TypeScript, Vite 8, React Router 7, and Supabase Auth. Business data is read and written through the Express backend; the browser uses only the Supabase public/anon key for authentication and sends the resulting user access token as a bearer token.

## Requirements and setup

- Node.js 20.19 or newer (or 22.12 or newer) and npm, as required by Vite 8.
- The backend in `../backend` and a Supabase project with Auth enabled.
- Apply the SQL migrations in `../backend/supabase/migrations` before using persisted features.

```powershell
Set-Location .\backend
npm install
Copy-Item .env.example .env
# Add the development Supabase URL and anon/publishable key to backend\.env
npm run dev
```

In a second terminal:

```powershell
Set-Location .\Frontend
npm install
Copy-Item .env.example .env
# Add the same Supabase project URL and its public anon/publishable key to Frontend\.env
npm run dev
```

The API listens on port `3000` by default, and Vite listens on port `5173`. The frontend variable `VITE_API_BASE_URL` accepts either the API origin (`http://localhost:3000`) or the versioned API base (`http://localhost:3000/api/v1`); the example uses the latter. If Vite selects another port, add that exact origin to backend `FRONTEND_ORIGINS`. In development only, the backend also permits `http://localhost:5173` and `http://127.0.0.1:5173` when `FRONTEND_ORIGINS` is empty. Production must configure explicit origins.

Check backend liveness at `http://localhost:3000/health`, readiness at `http://localhost:3000/ready`, and API documentation at `http://localhost:3000/docs`. Readiness requires configured and reachable Supabase services.

## Environment variables

Copy `.env.example` to `.env`; the Vite `.env` must contain browser-safe values only:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Backend origin or API base; defaults in the example to `http://localhost:3000/api/v1`. |
| `VITE_SUPABASE_URL` | Supabase project URL used by Supabase Auth. |
| `VITE_SUPABASE_ANON_KEY` | Public anon/publishable key; never put a service-role/secret key here. |

The backend separately requires `SUPABASE_URL` and `SUPABASE_ANON_KEY`; server-only optional keys and provider settings are documented in `../backend/README.md`. Frontend `.env` values are public build-time configuration, not secrets.

## Feature-to-endpoint mapping

All listed application endpoints are prefixed with `/api/v1` and require a valid Supabase access-token bearer header unless stated otherwise. Responses use `{ "data": ... }`; list endpoints return `{ items, page, limit, total }`. Request shapes are camelCase and validated by backend Zod schemas.

| Page / action | Current source / endpoint | Method and request | Response / status |
| --- | --- | --- | --- |
| Landing page | No data request | Navigates to the existing auth route | Marketing copy names available features without claiming connected AI/GST filing. |
| Sign in, sign up, password reset, email confirmation, session restore, sign out | Supabase Auth SDK; `GET /auth/me` exists for backend identity verification | Supabase Auth email/password and recovery flow; protected API calls attach the current access token | Auth is persisted/refreshed by Supabase. Configure `/auth?flow=recovery` as an allowed Supabase redirect URL. Phone and magic-link sign-in are unavailable; no custom password API. |
| Business onboarding | `POST /businesses` | `{ name, legalName?, gstin?, address?, invoiceSettings? }` | Created business; one-owner/one-business enforced server-side. |
| Business profile | `GET/PATCH /businesses/current` | PATCH accepts at least one of the business fields | Authoritative current business record. |
| Customers list/create/edit/archive | `GET/POST /customers`, `PATCH/DELETE /customers/{customerId}` | Search/page query; customer `{ name, email?, phone?, address?, taxId?, notes? }` | Active customer records; archive is `204`. |
| Customer detail and ledger | `GET /customers/{customerId}`, `GET /customers/{customerId}/ledger` | Customer UUID in path | Customer record, invoices/payments and server-calculated ledger totals. |
| Dashboard | Composed reads: `/businesses/current`, `/customers`, `/invoices`, `/cashflow/snapshots`, `/cashflow/forecast/latest`, `/cashflow/entries` | GET; paginated records are fetched until the backend total is reached | Real account data only; no dashboard aggregation endpoint or fabricated fallback. Missing forecasts/snapshots are shown as empty. |
| Invoice draft | `POST /invoices/preview`, `POST /invoices` | `{ items: [{ description, quantityMilli, unitPricePaise, discountBps?, taxRateBps? }] }`; draft also takes `customerId`, optional dates/notes; `Idempotency-Key` required | Backend-calculated totals and invoice record. |
| Invoice list/detail/update | `GET /invoices`, `GET/PATCH /invoices/{invoiceId}` | Pagination/filter query; edits accept draft invoice fields | Authoritative status, amounts, and line items. |
| Invoice issue/cancel | `POST /invoices/{invoiceId}/issue`, `POST /invoices/{invoiceId}/cancel` | Cancel requires `{ reason }` | Backend controls lifecycle transitions. |
| Invoice print/PDF/UPI QR/timeline/documents | `GET /invoices/{invoiceId}/preview`, `/pdf`, `/upi-qr`, `/timeline`, `/documents`; `GET /invoices/documents/{documentId}/download` | GET; bearer token required | HTML preview, authorized PDF, balance-based UPI QR, immutable events, and authorized signed document downloads. Storage configuration may still be required. |
| Manual payment and allocation | `POST /payments` | `{ customerId, amountPaise, method, allocations }`; `Idempotency-Key` required | Backend payment record and allocations update invoice balances atomically. |
| Cash-flow snapshot and forecast | `POST /cashflow/snapshots`, `POST /cashflow/forecast`, `GET /cashflow/forecast/latest` | Snapshot `{ amountPaise, recordedAt? }`; forecast `{ horizonDays, startDate? }` | Persisted server snapshot and deterministic forecast; shortage is based on negative balance. |
| Cash-flow entries | `GET/POST/DELETE /cashflow/entries`, `GET/PATCH/DELETE /cashflow/entries/{entryId}` | Date/page query; create direction, amount, date, category and actual flag | Listing, creation, and deletion use the API. Editing is supported by the backend but not exposed in the current UI. |
| Recovery Copilot | Reads invoices and customers | No strategy/reminder endpoint exists | Shows current outstanding balances only; recommendation and delivery workflows are not simulated. |
| Shock Simulator | Reads snapshots and scheduled cash entries | No scenario endpoint exists | Clearly labeled, client-side hypothetical sensitivity view, not a saved backend forecast. |
| GST Center | Reads invoice/customer list and invoice detail | No purchase-record, GST filing, or portal endpoint exists | Shows stored invoice line tax only; purchase ITC, liability, portal reconciliation, and filing are unavailable. |
| Documents / evidence | Invoice document list/download endpoints exist in backend | UI lists and downloads invoice documents; no browser upload or general evidence endpoint | Private invoice documents use backend tenant authorization and short-lived signed URLs. Arbitrary evidence upload is unavailable. |
| Reminders, email delivery, AI/ML strategy | No operational frontend API contract | Not connected | Explicitly unavailable; no success-shaped demo response. |
| Permissions, employee invitations, standalone Cash Flow/Radar, and other disabled navigation entries | No separate implemented frontend or endpoint contract | Disabled links remain non-interactive | Team invitations and role assignment are intentionally out of scope; cash flow is presented in Cash Flow Lab. |

The backend OpenAPI document at `/openapi.json` and Zod schemas are the contract source. The complete current backend endpoint inventory is in `../backend/README.md`.

## Authentication and data boundaries

- Protected routes restore the Supabase session and redirect unauthenticated users to `/auth`.
- A missing business routes an authenticated owner to `/business/setup`; business profile changes use the backend.
- Browser requests never send a user-supplied business ID as authorization. The backend derives the owner/business context from the verified JWT.
- Only the Supabase anon/publishable key is permitted in this frontend. Privileged Supabase, Razorpay, n8n, and ML credentials stay server-side.
- `VITE_API_BASE_URL` must point to the Express API. No frontend feature reads Supabase tables directly.

## Checks

```powershell
npm run lint
npm run build
```

The frontend currently has no separate unit-test script. The backend's `npm test` exercises API and service behavior without contacting real providers.
