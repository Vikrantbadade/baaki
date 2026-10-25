import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { n8nDeliverySchema } from "../schemas/webhook.schemas.js";

export function verifyN8nWebhook(req, _res, next) {
  if (!env.N8N_WEBHOOK_SECRET) {
    next(new AppError(503, "N8N_NOT_CONFIGURED", "n8n callback authentication is not configured"));
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    next(new AppError(400, "INVALID_WEBHOOK_BODY", "n8n callback body must be raw JSON"));
    return;
  }

  const signature = req.get("x-n8n-signature") ?? "";
  const expected = createHmac("sha256", env.N8N_WEBHOOK_SECRET).update(req.body).digest();
  let provided;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    provided = Buffer.alloc(0);
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    next(new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "n8n callback signature is invalid"));
    return;
  }

  try {
    const body = JSON.parse(req.body.toString("utf8"));
    const result = n8nDeliverySchema.safeParse(body);
    if (!result.success) {
      next(
        new AppError(
          400,
          "INVALID_DELIVERY_STATUS",
          "n8n callback validation failed",
          result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    req.webhookPayload = result.data;
  } catch {
    next(new AppError(400, "INVALID_WEBHOOK_BODY", "Webhook body is not valid JSON"));
    return;
  }
  next();
}
