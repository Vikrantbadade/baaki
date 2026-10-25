import pino from "pino";
import { env } from "./env.js";

export const loggerRedaction = Object.freeze({
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers.x-n8n-signature",
    "req.headers.x-razorpay-signature",
    "req.url",
    "authorization",
    "access_token",
    "refresh_token",
    "password",
    "key_secret",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "N8N_WEBHOOK_SECRET",
    "ML_SERVICE_AUTH_TOKEN",
  ],
  censor: "[REDACTED]",
});

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: loggerRedaction,
});
