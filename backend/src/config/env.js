import "dotenv/config";
import { z } from "zod";

function isHttpUrl(value) {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
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
  SUPABASE_URL: z
    .string()
    .trim()
    .url()
    .refine(isHttpUrl, "Must use HTTP or HTTPS")
    .transform((value) => value.replace(/\/+$/, "")),
  SUPABASE_ANON_KEY: z.string().trim().min(1),
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  RAZORPAY_KEY_ID: optionalText,
  RAZORPAY_KEY_SECRET: optionalText,
  RAZORPAY_WEBHOOK_SECRET: optionalText,
  N8N_BASE_URL: optionalHttpUrl,
  N8N_WEBHOOK_SECRET: optionalText,
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
});

const deprecatedSupabaseNames = {
  SUPABASE_PUBLISHABLE_KEY: "Use SUPABASE_ANON_KEY for a legacy anon or compatible publishable key.",
  SUPABASE_SECRET_KEY: "Use SUPABASE_SERVICE_ROLE_KEY for a legacy service-role or compatible secret key.",
};

export function parseEnvironment(source = process.env) {
  const deprecatedIssues = Object.entries(deprecatedSupabaseNames)
    .filter(([name]) => typeof source[name] === "string" && source[name].trim() !== "")
    .map(([name, message]) => `${name}: ${message}`);
  const result = envSchema.safeParse(source);

  if (!result.success || deprecatedIssues.length > 0) {
    const schemaIssues = result.success
      ? []
      : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    const details = [...deprecatedIssues, ...schemaIssues].join("; ");
    throw new Error(
      `Invalid environment configuration: ${details}. Remove obsolete names; secret values are never included in this error.`,
    );
  }

  return Object.freeze(result.data);
}

export const env = parseEnvironment();
