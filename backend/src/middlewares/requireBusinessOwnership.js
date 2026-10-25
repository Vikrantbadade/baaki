import { AppError } from "../errors/AppError.js";

export function requireBusinessOwnership(req, _res, next) {
  if (!req.business) {
    next(new AppError(403, "BUSINESS_CONTEXT_REQUIRED", "A resolved business context is required"));
    return;
  }
  if (req.resource?.business_id && req.resource.business_id !== req.business.id) {
    next(new AppError(404, "RESOURCE_NOT_FOUND", "The requested resource was not found"));
    return;
  }
  next();
}
