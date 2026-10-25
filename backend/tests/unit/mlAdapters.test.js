import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { env } = vi.hoisted(() => ({
  env: {
    ML_VOICE_SERVICE_URL: undefined,
    ML_STRATEGY_SERVICE_URL: undefined,
    ML_SERVICE_AUTH_TOKEN: undefined,
  },
}));

vi.mock("../../src/config/env.js", () => ({ env }));

import {
  requestCollectionStrategyModel,
  requestVoiceToJsonModel,
} from "../../src/integrations/ml/modelService.client.js";

describe("ML provider adapters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    env.ML_VOICE_SERVICE_URL = undefined;
    env.ML_STRATEGY_SERVICE_URL = undefined;
    env.ML_SERVICE_AUTH_TOKEN = undefined;
  });

  it("returns a clear 503 when a provider URL is not configured", async () => {
    await expect(requestVoiceToJsonModel()).rejects.toMatchObject({
      status: 503,
      code: "MODEL_SERVICE_NOT_CONFIGURED",
    });
    await expect(requestCollectionStrategyModel()).rejects.toMatchObject({
      status: 503,
      code: "MODEL_SERVICE_NOT_CONFIGURED",
    });
  });

  it("sends payload and authorization header to configured voice model and validates response", async () => {
    env.ML_VOICE_SERVICE_URL = "https://voice.example.test/api/voice";
    env.ML_SERVICE_AUTH_TOKEN = "secret-token-123";

    const mockResponse = {
      transcript: "Need 10000 rupees in 5 days",
      targetRupees: 10000,
      targetPaise: 1000000,
      deadlineDays: 5,
      confidence: 0.95,
      isDemoModel: true,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestVoiceToJsonModel({ transcript: "Need 10000 rupees in 5 days" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://voice.example.test/api/voice",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token-123",
        },
      }),
    );
    expect(result.targetPaise).toBe(1000000);
    expect(result.deadlineDays).toBe(5);
  });

  it("sends payload to configured strategy model and validates response schema", async () => {
    env.ML_STRATEGY_SERVICE_URL = "https://strategy.example.test/api/strategy";

    const mockResponse = {
      modelVersion: "baaki-planner-v1.0",
      isDemoPrediction: true,
      eligibleCount: 1,
      totalEligiblePaise: 500000,
      options: [
        {
          option: 1,
          strategy: "Fewest customers to contact",
          customerCount: 1,
          customerNames: ["Demo Customer"],
          invoiceIds: ["INV-001"],
          amountIfAllPayPaise: 500000,
          extraOverTargetPaise: 0,
          probabilityTargetMetPercent: 85.5,
          customers: [
            {
              customerId: "cust-1",
              customerName: "Demo Customer",
              invoiceId: "INV-001",
              outstandingPaise: 500000,
            },
          ],
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestCollectionStrategyModel({ targetPaise: 500000, deadlineDays: 7 });

    expect(fetchMock).toHaveBeenCalled();
    expect(result.options).toHaveLength(1);
    expect(result.options[0].strategy).toBe("Fewest customers to contact");
  });

  it("throws 502 when model service returns invalid schema or non-200 status", async () => {
    env.ML_VOICE_SERVICE_URL = "https://voice.example.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestVoiceToJsonModel()).rejects.toMatchObject({
      status: 502,
      code: "MODEL_SERVICE_ERROR",
    });
  });
});
