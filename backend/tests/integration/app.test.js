import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("HTTP application", () => {
  it("reports process liveness without requiring external services", async () => {
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("alive");
    expect(response.body.meta.requestId).toBeTruthy();
  });

  it("publishes OpenAPI documentation for implemented routes", async () => {
    const response = await request(app).get("/openapi.json");
    expect(response.status).toBe(200);
    expect(response.body.paths["/api/v1/invoices/preview"].post).toBeTruthy();
    expect(response.body.paths["/api/v1/invoices/{invoiceId}/pdf"].get).toBeTruthy();
    expect(response.body.paths["/api/v1/invoices/{invoiceId}/upi-qr"].get).toBeTruthy();
    expect(response.body.paths["/api/v1/invoices/{invoiceId}/timeline"].get).toBeTruthy();
  });

  it("protects invoice document endpoints with Supabase authentication", async () => {
    const invoiceId = "00000000-0000-4000-8000-000000000001";
    const response = await request(app).get(`/api/v1/invoices/${invoiceId}/pdf`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects protected business routes when no access token is provided", async () => {
    const response = await request(app).get("/api/v1/customers");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("allows only configured frontend origins and exposes download filenames", async () => {
    const allowed = await request(app).get("/health").set("Origin", "http://localhost:5173");
    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-expose-headers"]).toBe("Content-Disposition");

    const rejected = await request(app).get("/health").set("Origin", "https://untrusted.example");
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("rejects an unsigned Razorpay webhook before provider processing", async () => {
    const response = await request(app)
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .send('{"event":"payment.captured"}');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_WEBHOOK_SIGNATURE");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("normalizes malformed JSON into a request validation error", async () => {
    const response = await request(app)
      .post("/api/v1/businesses")
      .set("Authorization", "Bearer invalid-test-token")
      .set("Content-Type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.body.error.requestId).toBeTruthy();
  });
});
