# Baaki backend implementation plan

## Requirements mapped to modules

| Requirement | Planned module |
| --- | --- |
| Express setup, request IDs, logging, CORS, errors, health/readiness, OpenAPI | `src/app.js`, `src/config/`, `src/middlewares/`, `src/docs/` |
| Supabase Auth, one-business ownership and RLS | `src/middlewares/authenticateUser.js`, `src/middlewares/loadBusinessContext.js`, `supabase/migrations/` |
| Business settings and customers/ledger | `src/routes/`, `src/services/`, `src/repositories/` |
| Server-calculated invoice totals, draft/issue lifecycle, immutable issue snapshots, India financial-year numbering | `src/services/invoices.service.js`, `src/utils/money.js`, migration RPCs |
| Manual payments, allocations, idempotency and audit trail | `src/services/payments.service.js`, migration RPCs |
| Razorpay signed webhook receipt/deduplication; payment links and reconciliation remain open | raw-body webhook route and migration RPC |
| ML adapter interfaces with explicit 503 until provider contracts are supplied; model output schemas and collection-plan approval remain open | `src/integrations/ml/modelService.client.js`; no transport call is made without verified contracts |
| Deterministic cash-flow projections | `src/services/cashflow.service.js` |
| Signed n8n delivery-status callbacks; reminder scheduling remains open | raw-body callback route and migration RPC |
| Invoice PDF, UPI QR, private PDF storage and invoice timeline | `src/services/invoicePdf.service.js`, `src/services/invoiceDocuments.service.js`, `src/services/invoicePresentation.service.js`, migration |
| Invoice email delivery, demand letters, arbitrary evidence upload, public links, dashboard/reports | Not implemented |
| Browser API test interface | `public/index.html` |
| Automated verification | `tests/`, Vitest and Supertest |

## Current repository state

- The workspace initially contained only the specification files. It now also contains the implemented source tree, tests, migration, plain HTML console, package manifest, and setup documentation.
- No lockfile was present. No real `.env` values were read or overwritten.
- The environment contract is centralized in `src/config/env.js`; the canonical Supabase variables remain `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Deprecated `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` aliases are rejected rather than silently accepted.
- Supabase project keys are distinct from verified user access tokens. User-scoped requests verify the bearer JWT through Supabase Auth; privileged credentials remain server-only and are only required when privileged callback processing is invoked.
- Regression cases now cover minimal/invalid environment configuration, optional integrations, alias rejection and error/log secret redaction, Supabase client setup, and JWT-based authentication. These tests have not yet been executed.
- Shell-based validation is unavailable: the sandbox could not start PowerShell because local network access is disabled. VS Code test discovery reports zero registered test controllers.

## Implementation phases

1. **Foundation:** package scripts/dependencies, validated environment, Express middleware ordering, structured errors/logging, health/readiness, OpenAPI, plain HTML API client.
2. **Data security:** Supabase token verification, per-request JWT-scoped database access, server-derived business context, constraints and RLS policies.
3. **Financial core:** business setup, customers/ledger, invoice preview/drafts/issue/cancel, manual payments and allocations with atomic database functions and audit events.
4. **Cash flow:** snapshots, expected entries, deterministic forecast and shortage/gap calculation.
5. **External integrations and reporting:** Razorpay reconciliation/payment links, model adapters and approval workflow, n8n reminder scheduling, storage/public pages, dashboard and reports.
6. **Verification and handoff:** execute focused tests, lint/build/startup checks and migration validation; update results after command access is restored.

## Assumptions and open decisions

- Use ESM JavaScript, Express, Supabase PostgreSQL/Auth, Zod, Pino, Vitest and Supertest as specified.
- Use integer INR paise for persisted financial amounts and calculate GST as an explicit percentage with a documented half-up rounding rule. GSTIN validation, tax-inclusive pricing, invoice numbering format and statutory compliance remain unclaimed pending product/legal decisions.
- New invoice numbering uses a per-business April–March financial-year sequence (`YYYY-YY-000001`). Previously issued records retain their existing identifiers and do not receive fabricated historical snapshots.
- One owner maps to exactly one business; use Supabase RLS and never accept owner/business identity as authorization input.
- Refund/credit-note policy, overpayment policy, reminder consent/channels, public-token expiry, account deletion/retention, and optional exports/files need product decisions.
- The voice/strategy model request and response contracts are unknown. Adapters must report unavailable configuration rather than fabricate results.

## Missing credentials and external dependencies

- No Supabase project URL/keys, Razorpay keys, n8n URL/secret, model URLs/auth token, or test database credentials are available in this workspace.
- No service credentials will be created or embedded. Provider-backed operations require configuration and external verification before being described as operational.
- The shell sandbox currently blocks command startup due disabled local network access; this prevents dependency installation and running tests/build/startup checks until sandbox access is restored.
- VS Code test discovery was also attempted, but there is no registered test controller; the repository test script therefore remains unexecuted.

## Progress

- [x] Read the Markdown specification and inspect the workspace.
- [x] Record initial repository state, module mapping, phases, assumptions, and blockers.
- [x] Add Express setup, validated environment, request/error middleware, logging, health/readiness, rate limiting and OpenAPI subset.
- [x] Add the plain HTML API test console and honest endpoint availability labels.
- [x] Add Supabase Auth/business context, core schema, RLS, invoice/payment/cash-flow transaction functions and audit/idempotency records.
- [x] Add business, customer/ledger, invoice, manual payment/allocation and deterministic cash-flow routes/services.
- [x] Add signed, deduplicated Razorpay event receipt, signed n8n delivery-status callback, and isolated ML transport adapters.
- [x] Integrate the two AI models from backend/models: Voice Collection Planner (Whisper/Hindi/English NLP extraction) and Smart Collection Planner (combinatorial probability optimization), with Section 5.6 API routes, schema validation, Supabase persistence, approval lifecycle, and optional Python microservice.
- [ ] Implement Razorpay payment-link creation/event-to-payment reconciliation, outbound reminders delivery, dashboard and reports.
- [x] Add unit/integration test cases for money rounding, forecast results, webhook signatures, request schemas, liveness, OpenAPI and unauthenticated access.
- [x] Audit source, SQL, tests, configuration and the HTML console; fix persistent cash-flow audit records, repeated payment-to-invoice allocation support, idempotency key character validation, body-size error mapping, and request error log redaction.
- [x] Add console actions for invoice cancellation and payment allocation, plus cash snapshot/forecast history.
- [x] Standardize and validate the environment contract; document project API keys versus user JWTs and server-only privileged keys; add environment/client/auth regression tests.
- [x] Add issue-time invoice snapshots and April–March numbering, PDF/print preview, balance-based UPI QR, private PDF storage metadata, tenant-scoped document download, and immutable invoice event timeline.
- [ ] Complete GST-specific invoice type/state validation, outbound invoice delivery, demand letters, general evidence upload, and remaining PDF/storage integration checks.
- [ ] Run Node/npm version checks, dependency installation, tests, lint, migration and startup checks; blocked by sandbox command startup. See exact outcome in `README.md`.
