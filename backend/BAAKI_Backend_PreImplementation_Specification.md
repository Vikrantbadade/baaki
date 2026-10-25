# BAAKI --- Backend Pre-Implementation Specification

**Project ID:** `BAAKI-BE-001` (proposed working ID; replace if the
project tracker has an official ID)\
**Version:** 1.0\
**Status:** Pre-implementation specification --- proposed contract, not
proof that routes exist\
**API base path:** `/api/v1`\
**Purpose:** Establish the backend architecture, API contract,
middleware, data rules, security requirements, and implementation plan
before coding.

------------------------------------------------------------------------

## 1. Executive Summary

Baaki helps a small business create invoices, track customers and
receivables, record payments, plan collections, and forecast short-term
cash flow. The backend is the source of truth for financial calculations
and persisted state. The frontend must not be trusted to calculate
totals, declare invoices paid, or execute collection actions without
authorization.

### Product scope

-   Business onboarding and business settings (one user owns one
    business).
-   Customer directory and customer ledger.
-   Invoice/bill creator: draft, preview, issue, PDF, QR/payment link
    and delivery.
-   Payments, partial payments, allocations, refunds and Razorpay
    webhook processing.
-   Collection-strategy recommendation using the two existing ML models.
-   Cash-Crash Radar using deterministic cash-flow calculations; no
    extra ML model is planned for this feature.
-   Owner-approved reminders delivered via n8n, with delivery status
    callbacks.
-   Dashboard metrics and reports.

### Out of scope / constraints

-   No employee invitation, team membership or role-assignment feature.
-   No OpenAI API for negotiation copilot, message drafting or
    natural-language Q&A.
-   n8n orchestrates reminders and delivery; it does not own
    invoice/payment business logic.
-   ML demo probabilities must not be presented as verified or
    calibrated real-world probabilities.
-   Confirm applicable GST requirements before representing generated
    invoices as compliant tax invoices.

### Implementation status addendum (2026-10-25)

This document began as a proposed contract. The current implementation adds:

- Authenticated invoice preview, draft, issue, cancellation, list filtering, and retrieval routes.
- April-to-March financial-year invoice numbering in the form `YYYY-YY-000001`, assigned transactionally at issue time, with a stored issue-time JSON snapshot.
- Plain HTML print preview, server-generated PDF, UPI QR from stored business settings and current outstanding paise, private invoice-PDF storage, authorized short-lived download links, and an immutable invoice event timeline.
- Tenant-scoped storage and database RLS for invoice document metadata and timeline rows.

The implementation does not currently implement GST tax invoice/bill-of-supply classification, GSTIN or place-of-supply validation, CGST/SGST versus IGST, invoice email delivery, demand letters, general evidence upload, Razorpay links, or public invoice pages. It does not claim statutory GST compliance. Previously issued invoices are not given invented issue-time snapshots; PDF generation for those rows fails explicitly. See the repository README and implementation plan for current validation status.

## 2. Technology Decisions

  -----------------------------------------------------------------------
  Area                                Decision / responsibility
  ----------------------------------- -----------------------------------
  Runtime/API                         Node.js + Express; REST API under
                                      `/api/v1`

  Authentication                      Supabase Auth; backend verifies
                                      access JWT

  Database                            Supabase PostgreSQL; constraints
                                      and RLS reinforce business-data
                                      isolation

  Storage                             Supabase Storage for invoice PDFs,
                                      business logos and permitted files

  Validation                          Zod for params, query strings and
                                      request bodies

  Payments                            Razorpay Payment Links/payments;
                                      signed webhooks; idempotent
                                      processing

  Automation                          n8n for reminder/email scheduling
                                      and delivery status callbacks

  Logging                             Pino / pino-http with request ID;
                                      never log secrets or sensitive
                                      payment data

  API docs                            OpenAPI specification and Scalar or
                                      Swagger UI

  Testing                             Vitest or Jest + Supertest;
                                      integration tests against a test
                                      database/environment

  Money                               Integer paise for INR, or a
                                      carefully defined exact-decimal
                                      strategy; never binary
                                      floating-point for money

  Transactions                        PostgreSQL transactions/RPC or a
                                      transaction-capable database layer
                                      for multi-row financial changes
  -----------------------------------------------------------------------

## 3. Architecture and Ownership Boundaries

``` text
Frontend
  -> Express API (auth, validation, authorization, rate limits)
      -> Controllers (HTTP request/response only)
          -> Services (business rules and orchestration)
              -> Repositories / Supabase PostgreSQL
              -> Supabase Storage
              -> ML model service(s)
              -> Razorpay API
              -> n8n workflow webhook
      <- verified webhook events from Razorpay and n8n
```

### Responsibility rules

-   Controllers must remain thin; business calculations belong in
    service functions.
-   The authenticated user ID comes from the verified JWT, never from a
    client-provided owner ID.
-   The backend resolves the business for the authenticated user; every
    business record query is scoped to that business.
-   The database enforces unique `owner_user_id` on businesses to
    preserve one-user/one-business.
-   Razorpay webhook processing updates payment state only after
    signature verification and idempotency checks.
-   n8n receives only the minimum data needed for delivery and returns
    delivery status; it cannot directly mark invoices as paid.
-   ML outputs are untrusted input: validate schema, IDs, amounts,
    ranges and references before saving or displaying them.

## 4. API Conventions

  -----------------------------------------------------------------------
  Convention                          Rule
  ----------------------------------- -----------------------------------
  Base path                           `/api/v1`

  Content type                        `application/json`, except
                                      binary/PDF/file endpoints and
                                      Razorpay raw webhook

  IDs                                 Use UUIDs or the database's chosen
                                      opaque ID format consistently

  Pagination                          Use page/limit or cursor pagination
                                      consistently; set a maximum limit

  Filtering                           Use documented query parameters
                                      such as `status`, `from`, `to`, and
                                      `customerId`

  Dates                               Store timestamps in UTC; use ISO
                                      8601 in API responses; define
                                      date-only invoice fields clearly

  Currency                            Include currency code (e.g. INR)
                                      and represent money in paise or
                                      exact decimal values

  Idempotency                         Require an idempotency key for
                                      retry-prone financial
                                      creation/execution operations

  Errors                              Return a stable machine-readable
                                      code and requestId; do not expose
                                      stack traces

  Versioning                          Avoid breaking `/api/v1` without a
                                      deliberate migration/versioning
                                      decision
  -----------------------------------------------------------------------

### Suggested success and error envelope

Success:

``` json
{
  "data": {},
  "meta": { "requestId": "..." }
}
```

Error:

``` json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [],
    "requestId": "..."
  }
}
```

Use appropriate HTTP status codes: `200/201` success, `202` accepted
asynchronous work, `204` successful no-content operations, `400`
malformed input, `401` unauthenticated, `403` unauthorized, `404`
missing/out-of-scope resources, `409` state/idempotency conflicts, `422`
semantically invalid input, `429` rate limits and `500` unexpected
errors.

## 5. Complete Endpoint Inventory

This is the proposed API inventory. It is a design contract; it does not
assert that any route has already been implemented.

### 5.1 Authentication and account

  -----------------------------------------------------------------------
  Method                  Endpoint                Purpose
  ----------------------- ----------------------- -----------------------
  GET                     `/auth/me`              Get authenticated
                                                  user's profile

  PATCH                   `/auth/me`              Update profile details

  DELETE                  `/auth/me`              Request account
                                                  deletion, subject to
                                                  retention and legal
                                                  rules
  -----------------------------------------------------------------------

### 5.2 Business setup/settings

  -----------------------------------------------------------------------
  Method                  Endpoint                Purpose
  ----------------------- ----------------------- -----------------------
  POST                    `/businesses`           Create business during
                                                  initial setup only

  GET                     `/businesses/current`   Get current user's
                                                  business

  PATCH                   `/businesses/current`   Update business
                                                  details, GSTIN,
                                                  address, logo and
                                                  invoice settings
  -----------------------------------------------------------------------

### 5.3 Customers and ledger

  -----------------------------------------------------------------------------------
  Method                  Endpoint                            Purpose
  ----------------------- ----------------------------------- -----------------------
  POST                    `/customers`                        Create customer

  GET                     `/customers`                        List/search customers
                                                              with pagination

  GET                     `/customers/:customerId`            Get customer details

  PATCH                   `/customers/:customerId`            Update customer

  DELETE                  `/customers/:customerId`            Archive customer when
                                                              safe

  GET                     `/customers/:customerId/invoices`   List customer's
                                                              invoices

  GET                     `/customers/:customerId/payments`   List payments
                                                              associated with
                                                              customer

  GET                     `/customers/:customerId/ledger`     Show invoices,
                                                              payments, credits and
                                                              balance
  -----------------------------------------------------------------------------------

### 5.4 Invoice / bill creator

  -------------------------------------------------------------------------------------
  Method                  Endpoint                              Purpose
  ----------------------- ------------------------------------- -----------------------
  POST                    `/invoices/preview`                   Calculate line totals,
                                                                discounts, GST and
                                                                grand total without
                                                                saving

  POST                    `/invoices`                           Create a draft invoice

  GET                     `/invoices`                           List invoices with
                                                                status/date/customer
                                                                filters

  GET                     `/invoices/:invoiceId`                Get invoice and line
                                                                items

  PATCH                   `/invoices/:invoiceId`                Edit draft invoice only

  POST                    `/invoices/:invoiceId/issue`          Finalize, assign
                                                                invoice number and
                                                                issue date

  POST                    `/invoices/:invoiceId/cancel`         Cancel eligible invoice
                                                                with reason and audit
                                                                record

  GET                     `/invoices/:invoiceId/pdf`            Generate/download
                                                                invoice PDF

  GET                     `/invoices/:invoiceId/preview`        Get escaped plain
                                                                HTML print preview

  GET                     `/invoices/:invoiceId/upi-qr`         Generate UPI QR for
                                                                outstanding balance

  GET                     `/invoices/:invoiceId/timeline`       Read immutable
                                                                invoice events

  GET                     `/invoices/:invoiceId/documents`      List document metadata

  GET                     `/invoices/documents/:documentId/download`
                                                                Create a short-lived
                                                                authorized URL

  POST                    `/invoices/:invoiceId/send`           Request invoice email
                                                                delivery through n8n

  GET                     `/invoices/:invoiceId/payment-link`   Get existing payment
                                                                link if present

  POST                    `/invoices/:invoiceId/payment-link`   Create Razorpay payment
                                                                link

  GET                     `/invoices/:invoiceId/reminders`      View invoice reminder
                                                                history
  -------------------------------------------------------------------------------------

### 5.5 Payments and allocations

  ------------------------------------------------------------------------------------
  Method                  Endpoint                             Purpose
  ----------------------- ------------------------------------ -----------------------
  POST                    `/payments`                          Record offline payment
                                                               received

  GET                     `/payments`                          List payments with
                                                               filters

  GET                     `/payments/:paymentId`               Get payment and
                                                               allocations

  POST                    `/payments/:paymentId/allocations`   Allocate unallocated
                                                               payment to invoices

  GET                     `/payments/:paymentId/allocations`   List allocations

  POST                    `/payments/:paymentId/refund`        Initiate supported
                                                               refund

  POST                    `/payments/:paymentId/void`          Correct eligible
                                                               erroneous manual
                                                               payment with audit
                                                               trail

  POST                    `/webhooks/razorpay`                 Verify and process
                                                               Razorpay events
  ------------------------------------------------------------------------------------

### 5.6 Collection strategy / ML

  -------------------------------------------------------------------------------------
  Method                  Endpoint                              Purpose
  ----------------------- ------------------------------------- -----------------------
  POST                    `/collection-plans/interpret-voice`   Convert supported
                                                                transcript/audio input
                                                                into target/deadline
                                                                JSON

  POST                    `/collection-plans/preview`           Build recommendation
                                                                using actual
                                                                outstanding invoice
                                                                data

  POST                    `/collection-plans`                   Save validated
                                                                recommendation

  GET                     `/collection-plans`                   List plans

  GET                     `/collection-plans/:planId`           Get plan and
                                                                recommended invoices

  POST                    `/collection-plans/:planId/approve`   Record owner approval

  POST                    `/collection-plans/:planId/reject`    Record owner rejection

  POST                    `/collection-plans/:planId/execute`   Execute eligible
                                                                approved reminder
                                                                actions

  POST                    `/collection-plans/:planId/cancel`    Cancel eligible plan
  -------------------------------------------------------------------------------------

### 5.7 Cash-Crash Radar / cash flow

  ------------------------------------------------------------------------------
  Method                  Endpoint                       Purpose
  ----------------------- ------------------------------ -----------------------
  POST                    `/cashflow/snapshots`          Record current
                                                         available cash

  GET                     `/cashflow/snapshots/latest`   Get latest snapshot

  GET                     `/cashflow/snapshots`          View snapshot history

  POST                    `/cashflow/entries`            Add expected
                                                         inflow/outflow

  GET                     `/cashflow/entries`            List entries

  GET                     `/cashflow/entries/:entryId`   Get one entry

  PATCH                   `/cashflow/entries/:entryId`   Update expected entry

  DELETE                  `/cashflow/entries/:entryId`   Remove obsolete
                                                         expected entry

  POST                    `/cashflow/forecast`           Calculate deterministic
                                                         projection over a
                                                         horizon

  GET                     `/cashflow/forecast/latest`    Get latest saved
                                                         forecast

  GET                     `/cashflow/risks`              List projected shortage
                                                         dates and cash gaps
  ------------------------------------------------------------------------------

### 5.8 Reminders and n8n

  ---------------------------------------------------------------------------------
  Method                  Endpoint                          Purpose
  ----------------------- --------------------------------- -----------------------
  POST                    `/reminders`                      Request eligible
                                                            reminder

  GET                     `/reminders`                      List reminders

  GET                     `/reminders/:reminderId`          Get reminder status

  POST                    `/reminders/:reminderId/cancel`   Cancel pending reminder

  POST                    `/reminders/:reminderId/retry`    Retry eligible failed
                                                            delivery

  POST                    `/webhooks/n8n/delivery-status`   Receive authenticated
                                                            delivery status
  ---------------------------------------------------------------------------------

### 5.9 Dashboard and reports

  --------------------------------------------------------------------------
  Method                  Endpoint                   Purpose
  ----------------------- -------------------------- -----------------------
  GET                     `/dashboard/summary`       Outstanding, overdue,
                                                     collected and key
                                                     metrics

  GET                     `/dashboard/receivables`   Receivables summary

  GET                     `/dashboard/overdue`       Overdue invoices and
                                                     aging

  GET                     `/dashboard/collections`   Collection summary by
                                                     date range

  GET                     `/reports/receivables`     Receivables report

  GET                     `/reports/payments`        Payments report

  GET                     `/reports/invoices`        Invoice report

  GET                     `/reports/cashflow`        Cash-flow report

  GET                     `/reports/export`          Export authorized
                                                     report to CSV
  --------------------------------------------------------------------------

### 5.10 Public invoice/payment page

  ---------------------------------------------------------------------------------------------
  Method                  Endpoint                                      Purpose
  ----------------------- --------------------------------------------- -----------------------
  GET                     `/public/invoices/:shareToken`                View invoice through
                                                                        secure public token

  GET                     `/public/invoices/:shareToken/pdf`            Download public invoice
                                                                        PDF

  POST                    `/public/invoices/:shareToken/payment-link`   Create/retrieve
                                                                        eligible payment link

  GET                     `/public/payments/:shareToken/status`         View payment status
                                                                        with minimal data
  ---------------------------------------------------------------------------------------------

### 5.11 Files and assets (optional generic module)

  Method   Endpoint                    Purpose
  -------- --------------------------- -----------------------------------------
  POST     `/files/upload-url`         Create authorized upload URL
  POST     `/files/:fileId/complete`   Confirm and validate upload
  GET      `/files/:fileId`            Get metadata or authorized download URL
  DELETE   `/files/:fileId`            Delete eligible file

### 5.12 System

  Method   Endpoint          Purpose
  -------- ----------------- ----------------------------
  GET      `/health`         Liveness check
  GET      `/ready`          Readiness/dependency check
  GET      `/docs`           Open Scalar/Swagger UI
  GET      `/openapi.json`   Serve OpenAPI document

## 6. Middleware Inventory and Placement

  ------------------------------------------------------------------------------
  Middleware                     Where                   Responsibility
  ------------------------------ ----------------------- -----------------------
  `helmet`                       Core                    Set security headers

  `corsMiddleware`               Core                    Allow only configured
                                                         frontend origins

  `requestIdMiddleware`          Core                    Attach
                                                         request/correlation ID

  `pinoHttpMiddleware`           Core                    Structured request
                                                         logs; redact secrets

  `express.json()`               Core                    Parse JSON; do not run
                                                         before raw webhook
                                                         route

  `rateLimitMiddleware`          Core/routes             Limit abusive traffic;
                                                         tighter limits for
                                                         auth/public routes

  `authenticateUser`             Protected routes        Verify Supabase access
                                                         JWT

  `loadBusinessContext`          Protected business      Resolve the
                                 routes                  authenticated user's
                                                         business

  `requireBusinessOwnership`     Resource routes         Enforce business-scoped
                                                         resource access

  `requireVerifiedEmail`         Optional                Require verified email
                                                         for selected sensitive
                                                         operations

  `validateRequest`              Routes                  Validate
                                                         params/query/body using
                                                         Zod

  `idempotencyMiddleware`        Financial/retry-prone   Prevent duplicate
                                 routes                  writes or execution

  `requireInvoiceEditable`       Invoice edit routes     Permit changes only to
                                                         draft/eligible invoices

  `requireOutstandingBalance`    Collection/payment      Check current state and
                                 actions                 balance

  `requireOwnerApproval`         Collection execution    Require recorded owner
                                                         approval

  `auditLogMiddleware`           Sensitive mutations     Record actor, action,
                                                         entity and timestamp

  `razorpayRawBodyMiddleware`    Webhook route           Preserve raw request
                                                         bytes for signature
                                                         check

  `verifyRazorpayWebhook`        Razorpay webhook        Verify signature before
                                                         processing

  `verifyN8nWebhook`             n8n callback            Authenticate callback
                                                         with secret/signature

  `uploadValidationMiddleware`   File routes             Check type, size and
                                                         allowed target

  `aiModelOutputValidation`      ML integration          Validate model response
                                                         schema and references

  `asyncHandler`                 Async routes            Forward async failures
                                                         to Express error
                                                         handler

  `notFoundMiddleware`           Last                    Handle unknown routes

  `errorHandlerMiddleware`       Last                    Normalize errors
                                                         without leaking
                                                         internals
  ------------------------------------------------------------------------------

### Middleware order

``` javascript
app.use(helmet());
app.use(corsMiddleware);
app.use(requestIdMiddleware);
app.use(pinoHttpMiddleware);

// Register Razorpay webhook before express.json().
app.post(
  "/api/v1/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  verifyRazorpayWebhook,
  razorpayWebhookHandler
);

app.use(express.json());
app.use("/api/v1", rateLimitMiddleware);
app.use("/api/v1", apiRouter);
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);
```

Use a separate authenticated callback route for n8n. Do not expose
service-role keys or webhook secrets to the browser. Ownership checks
and validation should be attached to each applicable route or router.

## 7. Non-Negotiable Business Rules

1.  **Identity:** Never trust `ownerUserId` or client-provided
    `businessId` as proof of ownership. Derive the user from the
    verified JWT and resolve the user's business.
2.  **One user / one business:** Enforce a unique constraint on
    `businesses.owner_user_id`. `POST /businesses` is onboarding-only;
    use `GET/PATCH /businesses/current` afterward.
3.  **Business isolation:** Every read/write for customers, invoices,
    payments, plans, cash-flow entries, files and reports must be scoped
    to the authenticated business. Use PostgreSQL RLS as defense in
    depth.
4.  **Invoice totals:** Server calculates quantity × unit price,
    discounts, taxable value, GST and grand total. Never trust frontend
    totals.
5.  **Invoice lifecycle:** Drafts can be edited. Issued invoices are
    immutable except through explicitly supported
    cancellation/credit-note/correction flows with audit history.
6.  **Invoice numbering:** Assign final invoice number on issue using a
    concurrency-safe database mechanism.
7.  **Money:** Use integer paise or exact decimal arithmetic. Define
    rounding, GST inclusive/exclusive treatment, discounts and currency
    explicitly.
8.  **Payments:** Keep payments and `payment_allocations` separate.
    Support partial payments and allocation of one payment across
    multiple invoices where required.
9.  **Atomicity:** Update payment record, allocations and invoice
    outstanding balances in a database transaction/RPC or another truly
    atomic implementation.
10. **Payment verification:** Only verified Razorpay events or
    explicitly recorded offline payments can change payment state. A
    redirect, screenshot or ML estimate is not proof.
11. **Webhook idempotency:** Persist provider event IDs and process each
    event once. Verify signature before accepting event data.
12. **Collection strategy:** Fetch actual outstanding invoices on the
    backend. Validate model customer/invoice IDs against those records
    before saving recommendations.
13. **Owner approval:** No customer reminder is sent merely because a
    strategy was generated. Record owner approval before execution.
14. **Cash flow:** Cash-Crash Radar uses deterministic arithmetic over
    current cash and expected entries. Label projections as estimates.
15. **Reminder delivery:** n8n sends/coordinates messages and returns
    delivery status. Delivery status must not mutate invoice payment
    state.
16. **Public access:** Public invoice tokens must be high-entropy,
    scoped, revocable/expiring where feasible and reveal only minimum
    necessary information.
17. **Auditability:** Record actor, business, action, entity, timestamp
    and relevant before/after state for sensitive financial changes;
    redact secrets.
18. **Data deletion:** Archive customers where referenced by financial
    records. Define legal/accounting retention rules before hard
    deletion.
19. **No membership feature:** Do not implement
    `/businesses/:id/members` or employee/role assignment endpoints in
    this scope.
20. **No OpenAI integration:** Do not add OpenAI API calls for
    negotiation copilot, message drafting or natural-language Q&A.

## 8. Suggested Data Model

  -----------------------------------------------------------------------
  Entity/table                        Purpose / key relationships
  ----------------------------------- -----------------------------------
  `users` / Supabase Auth             Identity source; app profile may be
                                      stored separately

  `businesses`                        One row per owner; `owner_user_id`
                                      unique

  `customers`                         Customer contact and
                                      business-scoped details

  `invoices`                          Invoice header, number, status,
                                      dates, totals and outstanding
                                      balance; new issues also store
                                      financial year and immutable
                                      issue-time snapshot

  `invoice_items`                     Description, quantity, unit price,
                                      discount, tax rate and computed
                                      line amounts

  `payments`                          Payment received, method, provider
                                      reference, amount, status and
                                      timestamps

  `payment_allocations`               Maps payments to invoices; supports
                                      partial/multiple allocations

  `collection_plans`                  Target, deadline, model version,
                                      recommendation, status and approval
                                      timestamps

  `collection_plan_items`             Recommended customer/invoice
                                      actions and validated model output

  `cash_snapshots`                    Owner-entered current cash at a
                                      timestamp

  `cashflow_entries`                  Expected inflows/outflows, dates,
                                      amounts, category and status

  `reminders`                         Invoice/plan reference, channel,
                                      scheduled time, status and provider
                                      result

  `webhook_events`                    Provider event ID, type,
                                      received/processed status and safe
                                      metadata

  `audit_logs`                        Actor, business, action, entity,
                                      timestamp and change record

  `invoice_documents`                 Private Storage key, invoice/business
                                      scope, MIME type, size, checksum,
                                      uploader and timestamp

  `invoice_events`                    Immutable business/invoice timeline
                                      events created by database triggers

  `idempotency_keys`                  Scope, key, request hash, status
                                      and saved response/reference
  -----------------------------------------------------------------------

## 9. Suggested Project Folder Structure

``` text
src/
  app.js
  server.js
  config/
    env.js
    logger.js
    supabase.js
    razorpay.js
  routes/
    auth.routes.js
    business.routes.js
    customers.routes.js
    invoices.routes.js
    payments.routes.js
    collectionPlans.routes.js
    cashflow.routes.js
    reminders.routes.js
    dashboard.routes.js
    reports.routes.js
    public.routes.js
    webhooks.routes.js
  controllers/
  services/
  repositories/
  schemas/
  middlewares/
  integrations/
    ml/
    razorpay/
    n8n/
    storage/
  utils/
  errors/
  docs/
    openapi.yaml
  templates/
    invoices/
      invoice.html
  tests/
    unit/
    integration/
    fixtures/
supabase/
  migrations/
  seed.sql
```

## 10. Environment Variables

  -----------------------------------------------------------------------
  Variable                            Purpose / handling
  ----------------------------------- -----------------------------------
  `NODE_ENV`                          development/test/production

  `PORT`                              Express listening port

  `APP_BASE_URL`                      Public app/API base URL where
                                      needed

  `FRONTEND_ORIGINS`                  Comma-separated allowlisted origins

  `SUPABASE_URL`                      Supabase project URL

  `SUPABASE_ANON_KEY`                 Public/anon key where server client
                                      configuration requires it

  `SUPABASE_SERVICE_ROLE_KEY`         Privileged server-only secret;
                                      never expose to frontend

  Supabase JWT settings               Use the official token verification
                                      approach appropriate to project
                                      configuration

  `RAZORPAY_KEY_ID`                   Server-side Razorpay key ID

  `RAZORPAY_KEY_SECRET`               Server-only secret

  `RAZORPAY_WEBHOOK_SECRET`           Webhook signature verification
                                      secret

  `N8N_BASE_URL`                      Trusted n8n endpoint

  `N8N_WEBHOOK_SECRET`                Authenticate workflow callbacks as
                                      designed

  `ML_VOICE_SERVICE_URL`              Voice-to-JSON model endpoint, if
                                      served over HTTP

  `ML_STRATEGY_SERVICE_URL`           Collection strategy model endpoint,
                                      if served over HTTP

  `ML_SERVICE_AUTH_TOKEN`             Optional service credential; never
                                      log

  `LOG_LEVEL`                         Configured Pino level

  Rate-limit settings                 Limits/windows per environment
  -----------------------------------------------------------------------

Use a validated environment schema at startup and fail fast if required
configuration is missing. Keep `.env` out of Git; commit only
`.env.example` with placeholders.

## 11. Error Handling and Observability

-   Use a central error class or consistent mapping for validation,
    authentication, authorization, conflict, provider and internal
    errors.
-   Return `requestId` in every response so reports can be correlated
    with logs.
-   Redact authorization headers, cookies, payment secrets, webhook
    secrets, tokens and sensitive customer data from logs.
-   Log provider event IDs and internal entity IDs where safe; avoid
    logging full webhook payloads by default.
-   Add health (process alive) and readiness (required dependencies
    reachable) endpoints; do not expose configuration or secrets through
    them.
-   Use timeouts and bounded retries for ML/Razorpay/n8n requests; retry
    only operations designed to be idempotent.

## 12. Testing Requirements

  -----------------------------------------------------------------------
  Test category                       Minimum coverage
  ----------------------------------- -----------------------------------
  Unit tests                          Invoice totals/GST/rounding,
                                      outstanding balance, cash-flow
                                      projections, status transitions,
                                      model output validation

  API integration tests               Auth required, valid/invalid Zod
                                      input, business isolation,
                                      not-found behavior and consistent
                                      error envelope

  Financial tests                     Partial payment, overpayment
                                      policy, multi-invoice allocation,
                                      duplicate payment request, atomic
                                      failure/rollback

  Webhook tests                       Invalid signature rejected, valid
                                      signature accepted, duplicate event
                                      processed once, out-of-order event
                                      behavior

  Invoice tests                       Draft editing allowed; issued
                                      invoice editing rejected; invoice
                                      number uniqueness under concurrent
                                      issue requests

  Collection tests                    Model output references only
                                      existing outstanding invoices; demo
                                      probabilities labelled; no send
                                      before approval

  n8n tests                           Authenticated callback, duplicate
                                      delivery callback, failed
                                      delivery/retry/cancel handling

  Security tests                      Cross-business IDOR attempts, rate
                                      limiting, public token
                                      scope/expiry, upload restrictions
                                      and secret redaction

  Forecast tests                      Due-date ordering,
                                      inflows/outflows, zero/negative
                                      cash edge cases, shortage date and
                                      gap calculation
  -----------------------------------------------------------------------

## 13. Recommended Implementation Order

1.  Create repository, environment validation, Express app, logger,
    error handler, health/readiness endpoints and OpenAPI baseline.
2.  Configure Supabase Auth verification, business setup, ownership
    scoping, RLS and initial database migrations.
3.  Implement customers and customer ledger read model.
4.  Implement invoice preview, draft creation/edit, issue lifecycle,
    invoice numbering and PDF generation/storage.
5.  Implement offline payments, allocations, outstanding-balance
    calculation, idempotency and audit logs.
6.  Integrate Razorpay payment links and secure, idempotent webhook
    processing.
7.  Build dashboard summaries and receivables/overdue views from
    verified database state.
8.  Integrate ML services for voice-to-JSON and collection strategy;
    validate outputs and persist recommendation states.
9.  Implement owner approval and n8n reminder workflow with
    authenticated delivery callbacks.
10. Implement cash-flow entries and deterministic Cash-Crash Radar
    forecasts.
11. Implement public invoice pages, exports, file handling,
    load/security tests and deployment hardening.

## 14. Definition of Ready Before Coding a Module

-   Endpoint request and response schemas are documented.
-   Authentication and business ownership requirements are defined.
-   Allowed status transitions and error codes are defined.
-   Database tables, constraints and migration are designed.
-   Money/date/time/rounding rules are explicit.
-   Idempotency and transaction requirements are documented for writes.
-   Audit events and sensitive fields are identified.
-   Unit and integration test cases are listed.
-   External dependency behavior, timeouts and retry policy are
    specified.

## 15. Open Decisions to Confirm

-   Official project/tracker ID: `BAAKI-BE-001` is a proposed
    placeholder.
-   Exact model-serving contract: transcript vs raw audio for voice
    model; request/response schema, authentication, timeout and model
    version for both models.
-   GST invoice types, tax-inclusive/exclusive pricing, validated
    transaction context, intra/inter-state treatment, required fields
    and applicable legal requirements. The current backend makes no
    GST-compliance claim.
-   Outbound n8n/email invoice-delivery request and callback contracts,
    provider confirmation semantics, retries and duplicate prevention.
-   Demand-letter wording, language, retention and approval rules.
-   Refunds, credit notes, overpayments and payment allocation policy.
-   Reminder channels, consent/opt-out rules, sending limits and
    schedule policy.
-   Public invoice token expiry and revocation policy.
-   Data retention and account-deletion policy for financial records.
-   Whether generic file endpoints and CSV exports are required for the
    first MVP.

## 16. Final Implementation Principles

-   Database state is the source of truth for balances and invoice
    status.
-   The backend, not the frontend or ML model, decides whether a
    financial operation is valid.
-   Never silently rewrite an issued financial document.
-   Never send a reminder without checking current state and required
    approval.
-   Never process a payment webhook before signature verification and
    idempotency handling.
-   Use least privilege, RLS, ownership checks, audit logs and secret
    redaction together.
-   Ship a smaller, tested financial core before adding optional
    automation and reporting features.
