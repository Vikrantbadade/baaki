import { beforeEach, describe, expect, it, vi } from "vitest";

const { logger } = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../src/config/logger.js", () => ({ logger }));

import { errorHandlerMiddleware } from "../../src/middlewares/errorHandlerMiddleware.js";
import { AppError } from "../../src/errors/AppError.js";
import { throwOnSupabaseError, withSupabaseContext } from "../../src/utils/supabaseError.js";

describe("Supabase database errors", () => {
  beforeEach(() => {
    logger.error.mockClear();
    logger.warn.mockClear();
  });

  it("preserves the original database error while returning a generic API response", async () => {
    const originalError = {
      code: "PGRST205",
      message: "Could not find the table 'public.businesses' in the schema cache",
      details: 'Failing row contains ("Mira Rao", "customer@example.com"); select * from private_records',
      hint: "Authorization: Bearer eyJhbGci.payload.signature",
    };
    const { error } = await withSupabaseContext(
      Promise.resolve({ data: null, error: originalError }),
      "select",
      "businesses",
    );

    let appError;
    try {
      throwOnSupabaseError(error);
    } catch (caught) {
      appError = caught;
    }

    expect(appError).toBeInstanceOf(AppError);
    expect(appError.cause).toBe(originalError);
    expect(appError.databaseContext).toEqual({ operation: "select", table: "businesses" });

    const req = {
      id: "91e98365-c055-41bb-a8c2-ca3887d7df16",
      method: "GET",
      baseUrl: "/api/v1/businesses",
      route: { path: "/current" },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    errorHandlerMiddleware(appError, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "DATABASE_ERROR",
        message: "A database operation failed",
        requestId: req.id,
      },
    });
    const [logFields] = logger.error.mock.calls[0];
    expect(logger.error.mock.contexts[0]).toBe(logger);
    expect(logFields).toMatchObject({
      requestId: req.id,
      method: "GET",
      endpoint: "/api/v1/businesses/current",
      status: 500,
      operation: "select",
      table: "businesses",
      supabaseCode: "PGRST205",
    });
    expect(logFields.supabaseDetails).toBe("Failing row contains [REDACTED]");
    expect(logFields.supabaseHint).toBeUndefined();
  });

  it("logs expected database conflicts as warnings with the request context", async () => {
    const { error } = await withSupabaseContext(
      Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key" } }),
      "insert",
      "customers",
    );
    let appError;
    try {
      throwOnSupabaseError(error);
    } catch (caught) {
      appError = caught;
    }

    const req = { id: "request-id", method: "POST", baseUrl: "/api/v1/customers", route: { path: "/" } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandlerMiddleware(appError, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-id",
        operation: "insert",
        table: "customers",
        supabaseCode: "23505",
      }),
      "Database operation failed",
    );
    expect(logger.warn.mock.contexts[0]).toBe(logger);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
