import "dotenv/config";
import { z } from "zod";

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isPostgresUrl(value) {
  try {
    return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function isHttpOrigin(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === value;
  } catch {
    return false;
  }
}

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);

const optionalHttpUrl = optionalText.pipe(
  z
    .string()
    .url()
    .refine(isHttpUrl, "Must use HTTP or HTTPS")
    .optional(),
);

const n8nEnabled = z.preprocess(
  (value) => (typeof value === "string" ? value.toLowerCase() : value),
  z.enum(["true", "false"]).transform((value) => value === "true"),
).default(false);

const appBaseUrl = z
  .string()
  .url()
  .refine(isHttpUrl, "Must use HTTP or HTTPS");

const frontendOrigins = z
  .string()
  .default("")
  .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean))
  .pipe(
    z.array(
      z
        .string()
        .url()
        .refine(isHttpOrigin, "Each frontend origin must be an HTTP(S) origin without a path"),
    ),
  )
  .refine((origins) => new Set(origins).size === origins.length, "Frontend origins must not contain duplicates");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_BASE_URL: appBaseUrl.default("http://localhost:3000"),
  FRONTEND_ORIGINS: frontendOrigins,
  DATABASE_URL: z
    .string()
    .trim()
    .url()
    .refine(isPostgresUrl, "Must use PostgreSQL"),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TOKEN_TTL: z.string().regex(/^\d+[smhd]$/, "Must be a duration such as 30m or 1h").default("30m"),
  RAZORPAY_KEY_ID: optionalText,
  RAZORPAY_KEY_SECRET: optionalText,
  RAZORPAY_WEBHOOK_SECRET: optionalText,
  N8N_BASE_URL: optionalText.pipe(
    z.string().url().refine(isHttpsUrl, "Must use HTTPS").optional(),
  ),
  N8N_WEBHOOK_SECRET: optionalText,
  N8N_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  N8N_ENABLED: n8nEnabled,
  ML_VOICE_SERVICE_URL: optionalHttpUrl,
  ML_STRATEGY_SERVICE_URL: optionalHttpUrl,
  ML_SERVICE_AUTH_TOKEN: optionalText,
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
}).superRefine((configuration, context) => {
  if (Boolean(configuration.RAZORPAY_KEY_ID) !== Boolean(configuration.RAZORPAY_KEY_SECRET)) {
    context.addIssue({
      code: "custom",
      path: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
      message: "Set both Razorpay API credentials or leave both empty",
    });
  }
  if (configuration.N8N_ENABLED && !configuration.N8N_BASE_URL) {
    context.addIssue({
      code: "custom",
      path: ["N8N_BASE_URL"],
      message: "Set N8N_BASE_URL when N8N_ENABLED is true",
    });
  }
});

export function parseEnvironment(source = process.env) {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(
      `Invalid environment configuration: ${details}. Secret values are never included in this error.`,
    );
  }

  return Object.freeze(result.data);
}

export const env = parseEnvironment();
