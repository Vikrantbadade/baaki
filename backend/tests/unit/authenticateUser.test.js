import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../src/config/database.js", async (importOriginal) => ({
  ...(await importOriginal()),
  pool: { query },
}));

import { authenticateUser } from "../../src/middlewares/authenticateUser.js";
import { env } from "../../src/config/env.js";

function makeToken({ userId, tokenId, expiresIn = "5m" }) {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    jwtid: tokenId,
    issuer: "baaki-api",
    audience: "baaki-client",
    expiresIn,
  });
}

describe("JWT user authentication", () => {
  beforeEach(() => query.mockReset());

  it("verifies a signed token and checks its active database session", async () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const tokenId = "00000000-0000-4000-8000-000000000002";
    const user = { id: userId, email: "owner@example.test", created_at: new Date() };
    query.mockResolvedValue({ rows: [user] });
    const req = { get: () => `Bearer ${makeToken({ userId, tokenId })}` };
    const next = vi.fn();

    await authenticateUser(req, {}, next);

    expect(query).toHaveBeenCalledWith(expect.stringContaining("auth_sessions"), [tokenId, userId]);
    expect(req.user).toMatchObject(user);
    expect(req.db.userId).toBe(userId);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects invalidly signed tokens without querying PostgreSQL", async () => {
    const next = vi.fn();
    await authenticateUser({ get: () => "Bearer invalid.token.value" }, {}, next);
    expect(query).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });

  it("rejects a valid JWT whose database session has been revoked", async () => {
    query.mockResolvedValue({ rows: [] });
    const next = vi.fn();
    await authenticateUser({
      get: () => `Bearer ${makeToken({
        userId: "00000000-0000-4000-8000-000000000001",
        tokenId: "00000000-0000-4000-8000-000000000002",
      })}`,
    }, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  });
});
