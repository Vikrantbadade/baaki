import { describe, expect, it } from "vitest";
import { parseEnvironment } from "../../src/config/env.js";

const minimalEnvironment = {
  SUPABASE_URL: "https://test-project.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_test-key",
};

describe("environment configuration", () => {
  it("accepts the minimal development configuration and applies safe defaults", () => {
    expect(parseEnvironment(minimalEnvironment)).toMatchObject({
      NODE_ENV: "development",
      PORT: 3000,
      APP_BASE_URL: "http://localhost:3000",
      FRONTEND_ORIGINS: [],
      SUPABASE_URL: "https://test-project.supabase.co",
      SUPABASE_ANON_KEY: "sb_publishable_test-key",
      LOG_LEVEL: "info",
    });
  });

  it("requires the Supabase URL and project API key", () => {
    expect(() => parseEnvironment({ SUPABASE_ANON_KEY: "test-key" })).toThrow(
      /SUPABASE_URL/,
    );
    expect(() => parseEnvironment({ SUPABASE_URL: minimalEnvironment.SUPABASE_URL })).toThrow(
      /SUPABASE_ANON_KEY/,
    );
  });

  it("rejects malformed Supabase URLs and ports", () => {
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, SUPABASE_URL: "not-a-url" }),
    ).toThrow(/SUPABASE_URL/);
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
      SUPABASE_SERVICE_ROLE_KEY: " ",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "",
      N8N_BASE_URL: "",
      N8N_WEBHOOK_SECRET: "",
      ML_VOICE_SERVICE_URL: "",
      ML_STRATEGY_SERVICE_URL: "",
      ML_SERVICE_AUTH_TOKEN: "",
    });

    expect(configuration.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(configuration.RAZORPAY_KEY_ID).toBeUndefined();
    expect(configuration.N8N_BASE_URL).toBeUndefined();
    expect(configuration.ML_STRATEGY_SERVICE_URL).toBeUndefined();
  });

  it("rejects partial Razorpay API credentials", () => {
    expect(() =>
      parseEnvironment({ ...minimalEnvironment, RAZORPAY_KEY_ID: "test-key" }),
    ).toThrow(/Set both Razorpay API credentials/);
  });

  it("rejects obsolete or conflicting Supabase aliases without revealing their values", () => {
    for (const [alias, canonical] of [
      ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"],
      ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    ]) {
      const secretValue = `test-value-for-${alias}`;
      let error;
      try {
        parseEnvironment({
          ...minimalEnvironment,
          [canonical]: "canonical-test-key",
          [alias]: secretValue,
        });
      } catch (caught) {
        error = caught;
      }

      expect(error.message).toContain(alias);
      expect(error.message).toContain(canonical);
      expect(error.message).not.toContain(secretValue);
    }
  });

  it("rejects URL values containing secrets without echoing them", () => {
    const secretValue = "do-not-print-this-url-value";
    let error;
    try {
      parseEnvironment({
        ...minimalEnvironment,
        SUPABASE_URL: secretValue,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error.message).toContain("SUPABASE_URL");
    expect(error.message).not.toContain(secretValue);
  });
});
