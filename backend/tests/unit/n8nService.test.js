import { describe, expect, it, vi } from "vitest";
import { deliverN8nEvent } from "../../src/services/n8n.service.js";

const event = {
  eventId: "collection-plan:00000000-0000-4000-8000-000000000001:reminders:v1",
  eventType: "collection_plan.reminders_requested",
  version: 1,
  occurredAt: "2026-10-25T14:00:00.000Z",
  businessId: "00000000-0000-4000-8000-000000000002",
  data: {
    collectionPlanId: "00000000-0000-4000-8000-000000000001",
    reminders: [{
      reminderId: "00000000-0000-4000-8000-000000000003",
      invoiceId: "00000000-0000-4000-8000-000000000004",
      channel: "whatsapp",
      scheduledAt: "2026-10-25T14:00:00.000Z",
    }],
  },
};
const enabledConfiguration = {
  N8N_ENABLED: true,
  N8N_BASE_URL: "https://n8n.example.test/webhook/exact-endpoint",
  N8N_TIMEOUT_MS: 15000,
};
const jsonHeaders = { get: () => "application/json" };
const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: jsonHeaders,
  text: async () => body,
});

describe("n8n outbound integration", () => {
  it("posts the versioned event to the configured endpoint without adding auth headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('{"accepted":true}'));
    const result = await deliverN8nEvent(event, {
      configuration: enabledConfiguration,
      fetchImpl,
    });

    expect(result).toEqual({ status: "accepted", eventId: event.eventId });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(enabledConfiguration.N8N_BASE_URL);
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers).toEqual({
      "content-type": "application/json",
      accept: "application/json",
    });
    expect(JSON.parse(options.body)).toEqual(event);
  });

  it("does not call the webhook when disabled", async () => {
    const fetchImpl = vi.fn();
    const result = await deliverN8nEvent(event, {
      configuration: { ...enabledConfiguration, N8N_ENABLED: false },
      fetchImpl,
    });

    expect(result).toEqual({ status: "disabled", eventId: event.eventId });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects invalid event payloads before making an upstream request", async () => {
    const fetchImpl = vi.fn();
    const result = await deliverN8nEvent({ ...event, businessId: "client-supplied-invalid-id" }, {
      configuration: enabledConfiguration,
      fetchImpl,
    });

    expect(result).toMatchObject({ status: "failed", errorCode: "N8N_INVALID_EVENT" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps upstream errors and malformed JSON without returning the upstream body", async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const failedResponse = await deliverN8nEvent(event, {
      requestId: "request-id",
      configuration: enabledConfiguration,
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse("private upstream diagnostic", 500)),
      log,
    });
    expect(failedResponse).toEqual({
      status: "failed",
      errorCode: "N8N_UPSTREAM_ERROR",
      eventId: event.eventId,
    });

    const malformedResponse = await deliverN8nEvent(event, {
      configuration: enabledConfiguration,
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse("{malformed")),
      log,
    });
    expect(malformedResponse.errorCode).toBe("N8N_INVALID_RESPONSE");
    expect(JSON.stringify([failedResponse, malformedResponse, log.warn.mock.calls])).not.toContain(
      "private upstream diagnostic",
    );
  });

  it("distinguishes request timeout from network failures without retrying", async () => {
    const timeout = new Error("timeout");
    timeout.name = "TimeoutError";
    const fetchImpl = vi.fn().mockRejectedValueOnce(timeout).mockRejectedValueOnce(new TypeError("network"));

    const timeoutResult = await deliverN8nEvent(event, {
      configuration: enabledConfiguration,
      fetchImpl,
    });
    const networkResult = await deliverN8nEvent(event, {
      configuration: enabledConfiguration,
      fetchImpl,
    });

    expect(timeoutResult.errorCode).toBe("N8N_TIMEOUT");
    expect(networkResult.errorCode).toBe("N8N_NETWORK_ERROR");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not log event data or credentials on failure", async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    await deliverN8nEvent(event, {
      requestId: "request-id",
      configuration: enabledConfiguration,
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse("private upstream diagnostic", 503)),
      log,
    });

    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-id",
        eventId: event.eventId,
        eventType: event.eventType,
        errorCode: "N8N_UPSTREAM_ERROR",
      }),
      "n8n automation delivery failed",
    );
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("private upstream diagnostic");
  });
});
