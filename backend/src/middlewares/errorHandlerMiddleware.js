import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import { getDatabaseErrorContext } from "../utils/databaseResult.js";

function sanitizeDiagnostic(value) {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g, "[REDACTED]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED]")
    .replace(/\b(?:postgres(?:ql)?:\/\/|https?:\/\/)\S+/gi, "[REDACTED]")
    .replace(/\b(?:select|insert\s+into|update\s+\S+\s+set|delete\s+from|alter\s+table|create\s+table|drop\s+table)\b[\s\S]*/gi, "[SQL redacted]")
    .replace(/Failing row contains[\s\S]*/gi, "Failing row contains [REDACTED]")
    .replace(/\(([^)]*)\)=\([^)]*\)/g, "($1)=([REDACTED])")
    .replace(/'[^']*'/g, "'[REDACTED]'")
    .replace(/"[^"]*"/g, '"[REDACTED]"')
    .replace(/\b\d{6,}\b/g, "[REDACTED]")
    .slice(0, 500);
}

function sanitizeDatabaseDetails(value) {
  const sanitized = sanitizeDiagnostic(value);
  if (!sanitized) return undefined;
  if (/^Key \([A-Za-z0-9_, ]+\)=\(\[REDACTED\]\) (?:already exists|is not present in table '[REDACTED]')\.?$/i.test(sanitized)) {
    return sanitized;
  }
  if (/^Failing row contains \[REDACTED\](?:; \[SQL redacted\])?$/i.test(sanitized)) {
    return sanitized;
  }
  return undefined;
}

function sanitizeDatabaseHint(value) {
  const sanitized = sanitizeDiagnostic(value);
  if (!sanitized) return undefined;
  if (/^Perhaps you meant to reference the column "[REDACTED]"\.?$/i.test(sanitized)) {
    return sanitized;
  }
  return undefined;
}

export function notFoundMiddleware(_req, _res, next) {
  next(new AppError(404, "NOT_FOUND", "The requested resource was not found"));
}

export function errorHandlerMiddleware(error, req, res, _next) {
  const parsedJsonError = error?.type === "entity.parse.failed";
  const oversizedBodyError = error?.type === "entity.too.large";
  const status = error instanceof AppError ? error.status : parsedJsonError ? 400 : oversizedBodyError ? 413 : 500;
  const code = error instanceof AppError
    ? error.code
    : parsedJsonError
      ? "INVALID_JSON"
      : oversizedBodyError
        ? "PAYLOAD_TOO_LARGE"
        : "INTERNAL_ERROR";
  const message = error instanceof AppError
    ? error.message
    : parsedJsonError
      ? "Request body contains invalid JSON"
      : oversizedBodyError
        ? "Request body exceeds the allowed size"
        : "An unexpected error occurred";

  const databaseError = error instanceof AppError ? error.cause : error;
  const databaseContext = error?.databaseContext ?? getDatabaseErrorContext(databaseError);
  if (databaseContext && databaseError) {
    const logFields = {
        requestId: req.id,
        method: req.method,
        endpoint: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || "/",
        status,
        operation: databaseContext.operation,
        table: databaseContext.table,
        databaseCode: sanitizeDiagnostic(databaseError.code),
        ...(databaseError.rollbackError
          ? { rollbackCode: sanitizeDiagnostic(databaseError.rollbackError.code) }
          : {}),
        databaseMessage: sanitizeDiagnostic(databaseError.message),
        databaseDetails: sanitizeDatabaseDetails(databaseError.detail),
        databaseHint: sanitizeDatabaseHint(databaseError.hint),
      };
    if (status >= 500) {
      logger.error(logFields, "Database operation failed");
    } else {
      logger.warn(logFields, "Database operation failed");
    }
  } else if (status >= 500) {
    logger.error(
      { errorName: error?.name, requestId: req.id, method: req.method },
      "Request failed",
    );
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(error instanceof AppError && error.details ? { details: error.details } : {}),
      requestId: req.id,
    },
  });
}
