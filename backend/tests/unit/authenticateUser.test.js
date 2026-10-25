import { beforeEach, describe, expect, it, vi } from "vitest";

const { createUserSupabaseClient } = vi.hoisted(() => ({
  createUserSupabaseClient: vi.fn(),
}));
vi.mock("../../src/config/supabase.js", () => ({ createUserSupabaseClient }));

import { authenticateUser } from "../../src/middlewares/authenticateUser.js";

describe("Supabase user authentication", () => {
  beforeEach(() => {
    createUserSupabaseClient.mockReset();
  });

  it("verifies and attaches the user returned for the bearer access token", async () => {
    const user = { id: "user-123" };
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      },
    };
    createUserSupabaseClient.mockReturnValue(supabase);
    const req = { get: () => "Bearer user-access-token" };
    const next = vi.fn();

    await authenticateUser(req, {}, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith("user-access-token");
    expect(req.user).toBe(user);
    expect(req.supabase).toBe(supabase);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a project publishable key presented as a user access token", async () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("invalid JWT") }),
      },
    };
    createUserSupabaseClient.mockReturnValue(supabase);
    const req = { get: () => "Bearer sb_publishable_project-key" };
    const next = vi.fn();

    await authenticateUser(req, {}, next);

    expect(supabase.auth.getUser).toHaveBeenCalledWith("sb_publishable_project-key");
    expect(next.mock.calls[0][0]).toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
    });
    expect(req.user).toBeUndefined();
  });
});
