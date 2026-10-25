import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import { pool } from "../config/database.js";
import { razorpayEventIdSchema, razorpayEventSchema } from "../schemas/webhook.schemas.js";
import { getDatabaseErrorContext, withDatabaseContext } from "../utils/databaseResult.js";

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

  const { data, error } = await withDatabaseContext(
    pool.query(
      "select public.store_razorpay_webhook_event($1,$2,$3::jsonb) as result",
      [eventId, event.event, JSON.stringify(event)],
    ).then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:store_razorpay_webhook_event",
    "webhook_events",
    { single: true },
  );
  if (error) {
    const appError = new AppError(503, "WEBHOOK_PROCESSING_FAILED", "Razorpay event could not be persisted");
    appError.cause = error;
    appError.databaseContext = getDatabaseErrorContext(error);
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
  const { data, error } = await withDatabaseContext(
    pool.query(
      "select public.record_n8n_delivery_status($1,$2,$3,$4,$5::jsonb) as result",
      [
        payload.eventId,
        payload.reminderId,
        payload.status,
        typeof payload.providerReference === "string" ? payload.providerReference : null,
        JSON.stringify(payload.result ?? {}),
      ],
    ).then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:record_n8n_delivery_status",
    "reminders",
    { single: true },
  );
  if (error) {
    const appError = new AppError(503, "DELIVERY_STATUS_FAILED", "Delivery status could not be recorded");
    appError.cause = error;
    appError.databaseContext = getDatabaseErrorContext(error);
    throw appError;
  }
  res.json({
    data: { recorded: true, duplicate: Boolean(data?.duplicate) },
    meta: { requestId: req.id },
  });
}
