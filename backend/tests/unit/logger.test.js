import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { loggerRedaction } from "../../src/config/logger.js";

describe("secret logging redaction", () => {
  it("redacts configured project and integration secrets from log output", () => {
    let output = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = pino({ redact: loggerRedaction, base: null }, stream);
    const secrets = [
      "test-supabase-service-role",
      "test-razorpay-secret",
      "test-n8n-secret",
      "test-ml-token",
    ];

    logger.info({
      SUPABASE_SERVICE_ROLE_KEY: secrets[0],
      RAZORPAY_KEY_SECRET: secrets[1],
      N8N_WEBHOOK_SECRET: secrets[2],
      ML_SERVICE_AUTH_TOKEN: secrets[3],
    });

    for (const secret of secrets) {
      expect(output).not.toContain(secret);
    }
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(secrets.length);
  });
});
