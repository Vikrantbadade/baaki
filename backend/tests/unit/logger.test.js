import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { loggerRedaction } from "../../src/config/logger.js";

describe("secret logging redaction", () => {
  it("redacts database, authentication, and integration secrets", () => {
    let output = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = pino({ redact: loggerRedaction, base: null }, stream);
    const secrets = [
      "postgres://baaki:secret@localhost/baaki",
      "test-jwt-secret",
      "test-razorpay-secret",
      "test-n8n-secret",
      "test-ml-token",
    ];

    logger.info({
      DATABASE_URL: secrets[0],
      JWT_SECRET: secrets[1],
      RAZORPAY_KEY_SECRET: secrets[2],
      N8N_WEBHOOK_SECRET: secrets[3],
      ML_SERVICE_AUTH_TOKEN: secrets[4],
    });

    for (const secret of secrets) expect(output).not.toContain(secret);
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(secrets.length);
  });
});
