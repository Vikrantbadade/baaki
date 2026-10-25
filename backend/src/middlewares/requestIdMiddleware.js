import { randomUUID } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestIdMiddleware(req, res, next) {
  const suppliedId = req.get("x-request-id");
  req.id = suppliedId && UUID_PATTERN.test(suppliedId) ? suppliedId : randomUUID();
  res.setHeader("x-request-id", req.id);
  next();
}
