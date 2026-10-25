import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";

export function verifyRazorpayWebhook(req, _res, next) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    next(new AppError(503, "RAZORPAY_NOT_CONFIGURED", "Razorpay webhook verification is not configured"));
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    next(new AppError(400, "INVALID_WEBHOOK_BODY", "Razorpay webhook body must be raw JSON"));
    return;
  }

  const signature = req.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest();
  let provided;
  try {
    provided = Buffer.from(signature, "hex");
  } catch {
    provided = Buffer.alloc(0);
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    next(new AppError(401, "INVALID_WEBHOOK_SIGNATURE", "Razorpay webhook signature is invalid"));
    return;
  }
  next();
}
