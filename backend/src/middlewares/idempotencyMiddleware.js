import { AppError } from "../errors/AppError.js";

export function idempotencyMiddleware(req, _res, next) {
  const key = req.get("idempotency-key");
  if (!key || !/^[\x21-\x7e]{8,128}$/.test(key)) {
    next(new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key of 8 to 128 characters"));
    return;
  }
  req.idempotencyKey = key;
  next();
}
