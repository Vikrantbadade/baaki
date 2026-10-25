import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/AppError.js";

export const voiceModelResponseSchema = z.object({
  transcript: z.string().default(""),
  targetRupees: z.number().min(0),
  targetPaise: z.number().int().min(0).optional(),
  deadlineDays: z.number().int().min(1).max(365),
  confidence: z.number().min(0).max(1).optional(),
  isDemoModel: z.boolean().default(true),
});

export const collectionStrategyResponseSchema = z.object({
  modelVersion: z.string().default("baaki-planner-v1.0"),
  isDemoPrediction: z.boolean().default(true),
  targetPaise: z.number().int().positive().optional(),
  deadlineDays: z.number().int().min(1).max(365).optional(),
  eligibleCount: z.number().int().min(0),
  totalEligiblePaise: z.number().int().min(0),
  options: z.array(
    z.object({
      option: z.number().int().positive(),
      strategy: z.string().min(1),
      customerCount: z.number().int().positive(),
      customerNames: z.array(z.string()).default([]),
      invoiceIds: z.array(z.string()).default([]),
      amountIfAllPayPaise: z.number().int().min(0),
      extraOverTargetPaise: z.number().int().min(0),
      probabilityTargetMetPercent: z.number().min(0).max(100),
      customers: z.array(
        z.object({
          customerId: z.string(),
          customerName: z.string().optional(),
          invoiceId: z.string(),
          outstandingPaise: z.number().int().min(0),
          expectedDaysToPay: z.number().int().optional(),
          paymentProbability: z.number().min(0).max(1).optional(),
        }),
      ),
    }),
  ),
});

async function callModelService(serviceName, serviceUrl, payload, responseSchema) {
  if (!serviceUrl) {
    throw new AppError(
      503,
      "MODEL_SERVICE_NOT_CONFIGURED",
      `${serviceName} service URL is not configured`,
    );
  }

  const headers = { "Content-Type": "application/json" };
  if (env.ML_SERVICE_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${env.ML_SERVICE_AUTH_TOKEN}`;
  }

  let response;
  try {
    response = await fetch(serviceUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new AppError(
      502,
      "MODEL_SERVICE_UNAVAILABLE",
      `Failed to connect to ${serviceName}: ${error.message}`,
    );
  }

  if (!response.ok) {
    throw new AppError(
      502,
      "MODEL_SERVICE_ERROR",
      `${serviceName} returned status ${response.status}`,
    );
  }

  let responseBody;
  try {
    responseBody = await response.json();
  } catch {
    throw new AppError(
      502,
      "MODEL_INVALID_RESPONSE",
      `${serviceName} did not return valid JSON`,
    );
  }

  const parsed = responseSchema.safeParse(responseBody);
  if (!parsed.success) {
    throw new AppError(
      502,
      "MODEL_CONTRACT_MISMATCH",
      `${serviceName} response did not match expected schema: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

export async function requestVoiceToJsonModel(payload = {}) {
  const data = await callModelService(
    "Voice-to-JSON model",
    env.ML_VOICE_SERVICE_URL,
    payload,
    voiceModelResponseSchema,
  );

  if (data.targetPaise === undefined && data.targetRupees !== undefined) {
    data.targetPaise = Math.round(data.targetRupees * 100);
  }
  return data;
}

export async function requestCollectionStrategyModel(payload = {}) {
  return callModelService(
    "Collection strategy model",
    env.ML_STRATEGY_SERVICE_URL,
    payload,
    collectionStrategyResponseSchema,
  );
}
