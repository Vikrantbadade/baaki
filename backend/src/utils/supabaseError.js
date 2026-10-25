import { AppError } from "../errors/AppError.js";

const supabaseErrorContexts = new WeakMap();

export function withSupabaseContext(query, operation, table) {
  const context = { operation, table };
  return query.then(
    (result) => {
      if (result?.error && typeof result.error === "object") {
        supabaseErrorContexts.set(result.error, context);
      }
      return result;
    },
    (error) => {
      if (error && typeof error === "object") {
        supabaseErrorContexts.set(error, context);
      }
      throw error;
    },
  );
}

export function getSupabaseErrorContext(error) {
  return error && typeof error === "object" ? supabaseErrorContexts.get(error) : undefined;
}

export function throwOnSupabaseError(error) {
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
  appError.databaseContext = getSupabaseErrorContext(error);
  throw appError;
}
