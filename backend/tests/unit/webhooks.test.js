import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyRazorpayWebhook } from "../../src/middlewares/verifyRazorpayWebhook.js";
import { verifyN8nWebhook } from "../../src/middlewares/verifyN8nWebhook.js";

function invoke(middleware, req) {
  let error;
  middleware(req, {}, (value) => {
    error = value;
  });
  return error;
}

function signature(secret, body) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("webhook authentication", () => {
  it("accepts a correctly signed Razorpay body and rejects an altered one", () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const validRequest = {
      body,
      get: () => signature("test-razorpay-secret", body),
    };
    const invalidRequest = {
      body,
      get: () => signature("wrong-secret", body),
    };

    expect(invoke(verifyRazorpayWebhook, validRequest)).toBeUndefined();
    expect(invoke(verifyRazorpayWebhook, invalidRequest)?.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  });

  it("verifies and validates the authenticated n8n delivery callback", () => {
    const body = Buffer.from(
      JSON.stringify({
        eventId: "evt-test-1",
        reminderId: "00000000-0000-4000-8000-000000000001",
        status: "delivered",
        result: { code: "sent" },
      }),
    );
    const req = {
      body,
      get: () => signature("test-n8n-secret", body),
    };

    expect(invoke(verifyN8nWebhook, req)).toBeUndefined();
    expect(req.webhookPayload.status).toBe("delivered");
  });

  it("rejects an n8n callback with an invalid signature", () => {
    const body = Buffer.from("{}");
    const req = { body, get: () => signature("wrong-secret", body) };
    expect(invoke(verifyN8nWebhook, req)?.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  });
});
