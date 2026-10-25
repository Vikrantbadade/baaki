import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../../src/config/env.js";

const minimalEnvironment = {
  DATABASE_URL: "postgres://baaki_app:test-password@127.0.0.1:5432/baaki",
  JWT_SECRET: "test-secret-that-is-long-enough-to-meet-thirty-two",
};

describe("environment configuration", () => {
  it("accepts the minimal development configuration and applies safe defaults", () => {
    expect(parseEnvironment(minimalEnvironment)).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      APP_BASE_URL: "http://localhost:3000",
      FRONTEND_ORIGINS: [],
      DATABASE_URL: minimalEnvironment.DATABASE_URL,
      JWT_ACCESS_TOKEN_TTL: "30m",
      LOG_LEVEL: "info",
    });
  });

  it("requires a PostgreSQL URL and a strong JWT secret", () => {
    expect(() => parseEnvironment({ JWT_SECRET: minimalEnvironment.JWT_SECRET })).toThrow(/DATABASE_URL/);
    expect(() => parseEnvironment({ DATABASE_URL: minimalEnvironment.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it("rejects malformed database URLs, weak JWT secrets, and ports", () => {
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, DATABASE_URL: "not-a-url" }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, DATABASE_URL: "https://example.test" }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, JWT_SECRET: "too-short" }),
    ).toThrow(/JWT_SECRET/);
    expect(() => parseEnvironment({ ...minimalEnvironment, PORT: "not-a-port" })).toThrow(/PORT/);
    expect(() => parseEnvironment({ ...minimalEnvironment, PORT: "65536" })).toThrow(/PORT/);
  });

  it("validates HTTP(S) integration URLs, frontend origins, and log levels", () => {
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, N8N_BASE_URL: "ftp://n8n.example.test" }),
    ).toThrow(/N8N_BASE_URL/);
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, FRONTEND_ORIGINS: "https://app.example.test/path" }),
    ).toThrow(/FRONTEND_ORIGINS/);
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, APP_BASE_URL: "file:///tmp/app" }),
    ).toThrow(/APP_BASE_URL/);
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, LOG_LEVEL: "verbose" }),
    ).toThrow(/LOG_LEVEL/);
  });

  it("allows unconfigured optional integrations and normalizes empty optional values", () => {
    const configuration = parseEnvironment({
      ...minimalEnvironment,
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "",
      N8N_BASE_URL: "",
      N8N_WEBHOOK_SECRET: "",
      N8N_ENABLED: "false",
      ML_VOICE_SERVICE_URL: "",
      ML_STRATEGY_SERVICE_URL: "",
      ML_SERVICE_AUTH_TOKEN: "",
    });

    expect(configuration.RAZORPAY_KEY_ID).toBeUndefined();
    expect(configuration.N8N_BASE_URL).toBeUndefined();
    expect(configuration.ML_STRATEGY_SERVICE_URL).toBeUndefined();
  });

  it("rejects partial Razorpay API credentials", () => {
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, RAZORPAY_KEY_ID: "test-key" }),
    ).toThrow(/Set both Razorpay API credentials/);
  });

  it("validates n8n HTTPS URL, enablement, and timeout configuration", () => {
    expect(parseEnvironment({
      ...minimalEnvironment,
      N8N_BASE_URL: "https://n8n.example.test/webhook/id",
      N8N_ENABLED: "true",
      N8N_TIMEOUT_MS: "12000",
    })).toMatchObject({
      N8N_BASE_URL: "https://n8n.example.test/webhook/id",
      N8N_ENABLED: true,
      N8N_TIMEOUT_MS: 12000,
    });
    expect(() => parseEnvironment({
      ...minimalEnvironment,
      N8N_BASE_URL: "http://n8n.example.test/webhook/id",
    })).toThrow(/N8N_BASE_URL/);
    expect(() => parseEnvironment({
      ...minimalEnvironment,
      N8N_ENABLED: "true",
    })).toThrow(/N8N_BASE_URL/);
    expect(() => parseEnvironment({
      ...minimalEnvironment,
      N8N_TIMEOUT_MS: "100",
    })).toThrow(/N8N_TIMEOUT_MS/);
  });

  it("rejects URL values containing secrets without echoing them", () => {
    const secretValue = "do-not-print-this-url-value";
    let error;
    try {
      parseEnvironment({
        ...minimalEnvironment,
        DATABASE_URL: secretValue,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error.message).toContain("DATABASE_URL");
    expect(error.message).not.toContain(secretValue);
  });
});
