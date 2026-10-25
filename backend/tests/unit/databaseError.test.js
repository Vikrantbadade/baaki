import { beforeEach, describe, expect, it, vi } from "vitest";

const { logger } = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../src/config/logger.js", () => ({ logger }));

import { errorHandlerMiddleware } from "../../src/middlewares/errorHandlerMiddleware.js";
import { AppError } from "../../src/errors/AppError.js";
import { throwOnDatabaseError, withDatabaseContext } from "../../src/utils/databaseResult.js";

describe("PostgreSQL error handling", () => {
  beforeEach(() => {
    logger.error.mockClear();
    logger.warn.mockClear();
  });

  it("preserves database diagnostics while returning a generic response", async () => {
    const originalError = {
      code: "42P01",
      message: 'relation "private_records" does not exist',
      detail: 'Failing row contains ("Mira Rao", "customer@example.com"); select * from private_records',
    };
    const { error } = await withDatabaseContext(
      Promise.reject(originalError),
      "select",
      "businesses",
    );

    let appError;
    try {
      throwOnDatabaseError(error);
    } catch (caught) {
      appError = caught;
    }
    expect(appError).toBeInstanceOf(AppError);
    expect(appError.cause).toBe(originalError);
    expect(appError.databaseContext).toEqual({ operation: "select", table: "businesses" });

    const req = {
      id: "request-id",
      method: "GET",
      baseUrl: "/api/v1/businesses",
      route: { path: "/current" },
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    errorHandlerMiddleware(appError, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "DATABASE_ERROR", message: "A database operation failed", requestId: req.id },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: req.id,
        endpoint: "/api/v1/businesses/current",
        operation: "select",
        table: "businesses",
        databaseCode: "42P01",
      }),
      "Database operation failed",
    );
    const [fields] = logger.error.mock.calls[0];
    expect(fields.databaseDetails).toBe("Failing row contains [REDACTED]");
    expect(JSON.stringify(fields)).not.toContain("customer@example.com");
    expect(JSON.stringify(fields)).not.toContain("private_records");
  });

  it("logs expected constraint failures at warning level", async () => {
    const { error } = await withDatabaseContext(
      Promise.reject({ code: "23505", message: "duplicate key", detail: "Key (email)=(x@example.test) already exists." }),
      "insert",
      "users",
    );
    let appError;
    try {
      throwOnDatabaseError(error);
    } catch (caught) {
      appError = caught;
    }
    errorHandlerMiddleware(appError, { id: "request-id", method: "POST", baseUrl: "/api/v1/auth" }, {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }, vi.fn());
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "insert", table: "users", databaseCode: "23505" }),
      "Database operation failed",
    );
  });
});
