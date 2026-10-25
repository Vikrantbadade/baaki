import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { poolQuery, transactionQuery } = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  transactionQuery: vi.fn(),
}));
vi.mock("../../src/config/database.js", () => ({
  pool: { query: poolQuery },
  withTransaction: (_userId, callback) => callback({ query: transactionQuery }),
}));

import { login, register } from "../../src/controllers/auth.controller.js";
import { env } from "../../src/config/env.js";

describe("local email authentication", () => {
  beforeEach(() => {
    poolQuery.mockReset();
    transactionQuery.mockReset();
  });

  it("registers with a bcrypt hash and creates a signed session", async () => {
    const user = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "owner@example.test",
      created_at: new Date(),
    };
    transactionQuery
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const req = { id: "request-id", validated: { body: { email: " Owner@Example.Test ", password: "correct-password" } } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await register(req, res);

    const passwordHash = transactionQuery.mock.calls[0][1][1];
    expect(passwordHash).not.toBe("correct-password");
    expect(await bcrypt.compare("correct-password", passwordHash)).toBe(true);
    expect(transactionQuery.mock.calls[0][1][0]).toBe("owner@example.test");
    const response = res.json.mock.calls[0][0];
    expect(res.status).toHaveBeenCalledWith(201);
    expect(response.data.user.email).toBe(user.email);
    expect(jwt.verify(response.data.accessToken, env.JWT_SECRET, {
      issuer: "baaki-api",
      audience: "baaki-client",
      algorithms: ["HS256"],
    }).sub).toBe(user.id);
    expect(JSON.stringify(response)).not.toContain(passwordHash);
  });

  it("returns the same invalid-credentials response for unknown users and wrong passwords", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 4);
    poolQuery.mockResolvedValueOnce({
      rows: [{ id: "user-id", email: "owner@example.test", password_hash: passwordHash }],
    });
    await expect(login(
      { validated: { body: { email: "owner@example.test", password: "wrong-password" } } },
      { status: vi.fn().mockReturnThis(), json: vi.fn() },
    )).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });

    poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(login(
      { validated: { body: { email: "missing@example.test", password: "wrong-password" } } },
      { status: vi.fn().mockReturnThis(), json: vi.fn() },
    )).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", status: 401 });
  });

  it("maps unique email conflicts to a safe conflict response", async () => {
    transactionQuery.mockRejectedValueOnce(Object.assign(new Error("unique violation"), { code: "23505" }));
    await expect(register(
      { validated: { body: { email: "owner@example.test", password: "correct-password" } } },
      { status: vi.fn().mockReturnThis(), json: vi.fn() },
    )).rejects.toMatchObject({ code: "EMAIL_ALREADY_REGISTERED", status: 409 });
  });
});
