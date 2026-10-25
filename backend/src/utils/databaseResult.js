import { AppError } from "../errors/AppError.js";

const contexts = new WeakMap();

export async function withDatabaseOperation(operationPromise, operation, table) {
  try {
    return await operationPromise;
  } catch (error) {
    if (error && typeof error === "object") contexts.set(error, { operation, table });
    throw error;
  }
}

export async function withDatabaseContext(operationPromise, operation, table, { single = false } = {}) {
  try {
    const result = await operationPromise;
    return {
      data: single ? result.rows[0] ?? null : result.rows,
      error: null,
      count: result.rowCount,
    };
  } catch (error) {
    contexts.set(error, { operation, table });
    return { data: null, error, count: null };
  }
}

export function getDatabaseErrorContext(error) {
  return error && typeof error === "object" ? contexts.get(error) : undefined;
}

export function throwOnDatabaseError(error) {
  if (!error) return;
  let status = 500;
  let code = "DATABASE_ERROR";
  let message = "A database operation failed";
  if (error.code === "23505" || error.code === "P0001") {
    status = 409;
    code = "CONFLICT";
    message = "The operation conflicts with the current resource state";
  } else if (error.code === "23503" || error.code === "23514") {
    status = 422;
    code = "INVALID_REFERENCE";
    message = "The request references invalid or incompatible data";
  }
  const appError = new AppError(status, code, message);
  appError.cause = error;
  appError.databaseContext = getDatabaseErrorContext(error);
  throw appError;
}
