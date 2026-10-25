const bearer = [{ bearerAuth: [] }];

const pathParameter = (name) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
});

const operation = (summary, security = true, requestBody = false, parameters = []) => ({
  summary,
  ...(security ? { security: bearer } : {}),
  ...(parameters.length ? { parameters } : {}),
  ...(requestBody
    ? {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: true },
            },
          },
        },
      }
    : {}),
  responses: {
    "200": { description: "Successful response" },
    "201": { description: "Resource created" },
    "202": { description: "Accepted; asynchronous processing may remain pending" },
    "204": { description: "Successful response with no body" },
    "400": { description: "Request validation failed" },
    "401": { description: "Authentication required" },
    "403": { description: "Access is forbidden" },
    "404": { description: "Resource not found" },
    "409": { description: "Conflict with current resource state" },
    "422": { description: "Semantically invalid request" },
    "429": { description: "Rate limit exceeded" },
    "500": { description: "Unexpected error" },
    "503": { description: "Dependency or integration is unavailable" },
  },
});

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Baaki Backend API",
    version: "1.0.0",
    description: "Implemented API subset. Endpoints not listed here are not yet available.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  paths: {
    "/health": { get: operation("Liveness status", false) },
    "/ready": { get: operation("Dependency readiness status", false) },
    "/api/v1/webhooks/razorpay": { post: operation("Verify and deduplicate a Razorpay event", false, true) },
    "/api/v1/webhooks/n8n/delivery-status": {
      post: operation("Record a signed n8n delivery callback", false, true),
    },
    "/api/v1/auth/register": { post: operation("Register with email and password", false, true) },
    "/api/v1/auth/login": { post: operation("Log in with email and password", false, true) },
    "/api/v1/auth/logout": { post: operation("Revoke the current access session") },
    "/api/v1/auth/me": { get: operation("Get authenticated user") },
    "/api/v1/auth/password": { post: operation("Update password for the authenticated user", true, true) },
    "/api/v1/auth/password-reset": {
      post: {
        ...operation("Request password reset; delivery is unavailable until mail is configured", false, true),
        responses: {
          "501": { description: "Password reset delivery is not configured" },
        },
      },
    },
    "/api/v1/businesses": { post: operation("Create the owner's initial business", true, true) },
    "/api/v1/businesses/current": {
      get: operation("Get current business"),
      patch: operation("Update current business", true, true),
    },
    "/api/v1/customers": {
      get: operation("List customers"),
      post: operation("Create customer", true, true),
    },
    "/api/v1/customers/{customerId}": {
      get: operation("Get customer", true, false, [pathParameter("customerId")]),
      patch: operation("Update customer", true, true, [pathParameter("customerId")]),
      delete: operation("Archive customer", true, false, [pathParameter("customerId")]),
    },
    "/api/v1/customers/{customerId}/invoices": {
      get: operation("List customer invoices", true, false, [pathParameter("customerId")]),
    },
    "/api/v1/customers/{customerId}/payments": {
      get: operation("List customer payments", true, false, [pathParameter("customerId")]),
    },
    "/api/v1/customers/{customerId}/ledger": {
      get: operation("Get customer ledger", true, false, [pathParameter("customerId")]),
    },
    "/api/v1/invoices/preview": { post: operation("Preview server-calculated invoice totals", true, true) },
    "/api/v1/invoices": {
      get: operation("List invoices"),
      post: operation("Create invoice draft; requires Idempotency-Key", true, true),
    },
    "/api/v1/invoices/{invoiceId}": {
      get: operation("Get invoice", true, false, [pathParameter("invoiceId")]),
      patch: operation("Edit draft invoice", true, true, [pathParameter("invoiceId")]),
    },
    "/api/v1/invoices/{invoiceId}/preview": {
      get: operation("Get a safe plain-HTML invoice print preview", true, false, [pathParameter("invoiceId")]),
    },
    "/api/v1/invoices/{invoiceId}/pdf": {
      get: {
        ...operation("Generate, persist and download the issued invoice PDF", true, false, [pathParameter("invoiceId")]),
        responses: {
          "200": { description: "PDF document", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
          "401": { description: "Authentication required" },
          "404": { description: "Invoice not found" },
          "409": { description: "Invoice is not issued or has no issue-time snapshot" },
          "503": { description: "Private document storage unavailable" },
        },
      },
    },
    "/api/v1/invoices/{invoiceId}/download": {
      get: {
        ...operation("Download an issued invoice PDF", true, false, [pathParameter("invoiceId")]),
        responses: {
          "200": { description: "PDF document", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } },
          "401": { description: "Authentication required" },
          "404": { description: "Invoice not found" },
          "409": { description: "Invoice has no issue-time snapshot" },
          "503": { description: "PDF storage unavailable or privileged metadata key missing" },
        },
      },
    },
    "/api/v1/invoices/{invoiceId}/upi-qr": {
      get: operation("Generate a UPI QR for the current outstanding balance", true, false, [pathParameter("invoiceId")]),
    },
    "/api/v1/invoices/{invoiceId}/documents": {
      get: operation("List invoice document metadata", true, false, [pathParameter("invoiceId")]),
    },
    "/api/v1/invoices/documents/{documentId}/download": {
      get: operation("Create a short-lived authorized document URL", true, false, [pathParameter("documentId")]),
    },
    "/api/v1/invoices/documents/{documentId}/content": {
      get: operation("Download using a single-use short-lived capability token", false, false, [pathParameter("documentId")]),
    },
    "/api/v1/invoices/{invoiceId}/timeline": {
      get: operation("List immutable invoice timeline events", true, false, [pathParameter("invoiceId")]),
    },
    "/api/v1/invoices/{invoiceId}/issue": {
      post: operation("Issue invoice", true, false, [pathParameter("invoiceId")]),
    },
    "/api/v1/invoices/{invoiceId}/cancel": {
      post: operation("Cancel eligible invoice", true, true, [pathParameter("invoiceId")]),
    },
    "/api/v1/payments": {
      get: operation("List payments"),
      post: operation("Record an offline payment; requires Idempotency-Key", true, true),
    },
    "/api/v1/payments/{paymentId}": {
      get: operation("Get payment and allocations", true, false, [pathParameter("paymentId")]),
    },
    "/api/v1/payments/{paymentId}/allocations": {
      get: operation("List payment allocations", true, false, [pathParameter("paymentId")]),
      post: operation("Allocate payment; requires Idempotency-Key", true, true, [pathParameter("paymentId")]),
    },
    "/api/v1/cashflow/snapshots": {
      get: operation("List cash snapshots"),
      post: operation("Record cash snapshot", true, true),
    },
    "/api/v1/cashflow/snapshots/latest": { get: operation("Get latest cash snapshot") },
    "/api/v1/cashflow/entries": {
      get: operation("List expected cash-flow entries"),
      post: operation("Create cash-flow entry", true, true),
    },
    "/api/v1/cashflow/entries/{entryId}": {
      get: operation("Get cash-flow entry", true, false, [pathParameter("entryId")]),
      patch: operation("Update cash-flow entry", true, true, [pathParameter("entryId")]),
      delete: operation("Delete cash-flow entry", true, false, [pathParameter("entryId")]),
    },
    "/api/v1/cashflow/forecast": { post: operation("Calculate and save deterministic forecast", true, true) },
    "/api/v1/cashflow/forecast/latest": { get: operation("Get latest forecast") },
    "/api/v1/cashflow/risks": { get: operation("Get latest forecast risks") },
    "/api/v1/collection-plans/interpret-voice": {
      post: operation("Convert voice transcript or audio into target and deadline JSON", true, true),
    },
    "/api/v1/collection-plans/preview": {
      post: operation("Build collection plan recommendations using live outstanding invoices", true, true),
    },
    "/api/v1/collection-plans": {
      get: operation("List collection plans"),
      post: operation("Save validated collection plan recommendation", true, true),
    },
    "/api/v1/collection-plans/{planId}": {
      get: operation("Get collection plan and recommended invoices", true, false, [pathParameter("planId")]),
    },
    "/api/v1/collection-plans/{planId}/approve": {
      post: operation("Record owner approval for collection plan", true, false, [pathParameter("planId")]),
    },
    "/api/v1/collection-plans/{planId}/reject": {
      post: operation("Record owner rejection for collection plan", true, true, [pathParameter("planId")]),
    },
    "/api/v1/collection-plans/{planId}/cancel": {
      post: operation("Cancel eligible collection plan", true, false, [pathParameter("planId")]),
    },
    "/api/v1/collection-plans/{planId}/execute": {
      post: operation("Execute approved plan, schedule reminders, and notify n8n best-effort", true, false, [pathParameter("planId")]),
    },
  },
};
