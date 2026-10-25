import { describe, expect, it, vi } from "vitest";
import { findBusinessForOwner } from "../../src/repositories/business.repository.js";

describe("business repository", () => {
  it("queries the public businesses relation by the authenticated owner id", async () => {
    const ownerUserId = "0c4ac570-2bb2-4b8f-b8f3-bbc91a6ea2bf";
    const result = { data: { id: "business-id", owner_user_id: ownerUserId }, error: null };
    const calls = [];
    const query = {
      select: vi.fn((...args) => {
        calls.push(["select", ...args]);
        return query;
      }),
      eq: vi.fn((...args) => {
        calls.push(["eq", ...args]);
        return query;
      }),
      maybeSingle: vi.fn(() => {
        calls.push(["maybeSingle"]);
        return Promise.resolve(result);
      }),
    };
    const supabase = {
      from: vi.fn((table) => {
        calls.push(["from", table]);
        return query;
      }),
    };

    await expect(findBusinessForOwner(supabase, ownerUserId)).resolves.toEqual(result);

    expect(calls).toEqual([
      ["from", "businesses"],
      ["select", "*"],
      ["eq", "owner_user_id", ownerUserId],
      ["maybeSingle"],
    ]);
  });
});
