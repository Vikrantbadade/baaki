import { createServiceRoleClient } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import { razorpayEventIdSchema, razorpayEventSchema } from "../schemas/webhook.schemas.js";
import { getSupabaseErrorContext, withSupabaseContext } from "../utils/supabaseError.js";

export async function razorpayWebhook(req, res) {
  let body;
  try {
    body = JSON.parse(req.body.toString("utf8"));
  } catch {
    throw new AppError(400, "INVALID_WEBHOOK_BODY", "Razorpay webhook body is not valid JSON");
  }
  const parsedEvent = razorpayEventSchema.safeParse(body);
  const parsedEventId = razorpayEventIdSchema.safeParse(req.get("x-razorpay-event-id"));
  if (!parsedEvent.success || !parsedEventId.success) {
    throw new AppError(400, "INVALID_WEBHOOK_EVENT", "Razorpay event ID and event type are required");
  }
  const event = parsedEvent.data;
  const eventId = parsedEventId.data;

  const client = createServiceRoleClient();
  const { data, error } = await withSupabaseContext(
    client.rpc("store_razorpay_webhook_event", {
      p_event_id: eventId,
      p_event_type: event.event,
      p_payload: event,
    }),
    "rpc:store_razorpay_webhook_event",
    "webhook_events",
  );
  if (error) {
    const appError = new AppError(503, "WEBHOOK_PROCESSING_FAILED", "Razorpay event could not be persisted");
    appError.cause = error;
    appError.databaseContext = getSupabaseErrorContext(error);
    throw appError;
  }
  if (data?.duplicate) {
    res.json({ data: { received: true, duplicate: true }, meta: { requestId: req.id } });
    return;
  }

  logger.info({ eventId, eventType: event.event, requestId: req.id }, "Verified Razorpay event stored");
  res.status(202).json({
    data: { received: true, processed: false },
    meta: { requestId: req.id },
  });
}

export async function n8nDeliveryStatus(req, res) {
  const payload = req.webhookPayload;
  const client = createServiceRoleClient();
  const { data, error } = await withSupabaseContext(
    client.rpc("record_n8n_delivery_status", {
      p_event_id: payload.eventId,
      p_reminder_id: payload.reminderId,
      p_status: payload.status,
      p_provider_reference: typeof payload.providerReference === "string" ? payload.providerReference : null,
      p_safe_result: payload.result ?? {},
    }),
    "rpc:record_n8n_delivery_status",
    "reminders",
  );
  if (error) {
    const appError = new AppError(503, "DELIVERY_STATUS_FAILED", "Delivery status could not be recorded");
    appError.cause = error;
    appError.databaseContext = getSupabaseErrorContext(error);
    throw appError;
  }
  res.json({
    data: { recorded: true, duplicate: Boolean(data?.duplicate) },
    meta: { requestId: req.id },
  });
}
