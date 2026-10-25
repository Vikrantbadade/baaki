import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import {
  checkSupabaseReadiness,
  createServiceRoleClient,
  createUserSupabaseClient,
} from "../../src/config/supabase.js";

describe("Supabase client configuration", () => {
  beforeEach(() => {
    createClient.mockReset();
    createClient.mockReturnValue({ client: true });
  });

  it("uses the project API key for client initialization and the user JWT for requests", () => {
    const client = createUserSupabaseClient("user-access-token");

    expect(client).toEqual({ client: true });
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-anon-key",
      expect.objectContaining({
        global: {
          headers: { Authorization: "Bearer user-access-token" },
        },
      }),
    );
  });

  it("does not require a privileged key for user-scoped client operations", () => {
    expect(() => createUserSupabaseClient("user-access-token")).not.toThrow();
  });

  it("fails explicitly when a server-only privileged operation lacks its key", () => {
    let error;
    try {
      createServiceRoleClient();
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "SUPABASE_ADMIN_NOT_CONFIGURED",
      status: 503,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("checks REST reachability without requesting the service-role-only OpenAPI document", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(checkSupabaseReadiness()).resolves.toBeUndefined();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe("https://example.supabase.co/auth/v1/health");
      expect(fetchMock.mock.calls[1][0]).toBe("https://example.supabase.co/rest/v1/");
      expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "OPTIONS" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
