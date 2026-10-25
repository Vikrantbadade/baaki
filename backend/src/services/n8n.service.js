import { z } from "zod";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const n8nEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  eventType: z.literal("collection_plan.reminders_requested"),
  version: z.literal(1),
  occurredAt: z.string().datetime(),
  businessId: z.string().uuid(),
  data: z.object({
    collectionPlanId: z.string().uuid(),
    reminders: z.array(
      z.object({
        reminderId: z.string().uuid(),
        invoiceId: z.string().uuid().nullable(),
        channel: z.string().min(1).max(50),
        scheduledAt: z.string().datetime(),
      }).strict(),
    ).min(1),
  }).strict(),
}).strict();

function failureCode(error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return "N8N_TIMEOUT";
  return "N8N_NETWORK_ERROR";
}

export async function deliverN8nEvent(event, {
  requestId,
  configuration = env,
  fetchImpl = globalThis.fetch,
  log = logger,
} = {}) {
  const parsedEvent = n8nEventSchema.safeParse(event);
  if (!parsedEvent.success) {
    return { status: "failed", eventId: event?.eventId, errorCode: "N8N_INVALID_EVENT" };
  }

  if (!configuration.N8N_ENABLED) {
    return { status: "disabled", eventId: parsedEvent.data.eventId };
  }

  const url = configuration.N8N_BASE_URL;
  if (!url || new URL(url).protocol !== "https:") {
    return { status: "failed", eventId: parsedEvent.data.eventId, errorCode: "N8N_NOT_CONFIGURED" };
  }

  let result;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(parsedEvent.data),
      signal: AbortSignal.timeout(configuration.N8N_TIMEOUT_MS),
      redirect: "error",
    });

    if (!response.ok) {
      result = { status: "failed", errorCode: "N8N_UPSTREAM_ERROR" };
    } else {
      const responseText = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      if (responseText && contentType.includes("application/json")) {
        try {
          JSON.parse(responseText);
        } catch {
          result = { status: "failed", errorCode: "N8N_INVALID_RESPONSE" };
        }
      } else if (responseText && !contentType.startsWith("text/")) {
        result = { status: "failed", errorCode: "N8N_INVALID_RESPONSE" };
      }
      result ??= { status: "accepted" };
    }
  } catch (error) {
    result = { status: "failed", errorCode: failureCode(error) };
  }

  if (result.status === "failed") {
    log.warn(
      {
        requestId,
        eventId: parsedEvent.data.eventId,
        eventType: parsedEvent.data.eventType,
        errorCode: result.errorCode,
      },
      "n8n automation delivery failed",
    );
  } else {
    log.info(
      {
        requestId,
        eventId: parsedEvent.data.eventId,
        eventType: parsedEvent.data.eventType,
        status: result.status,
      },
      "n8n automation event delivered",
    );
  }

  return { ...result, eventId: parsedEvent.data.eventId };
}
