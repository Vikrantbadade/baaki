import { describe, expect, it, vi } from "vitest";
import { findBusinessForOwner } from "../../src/repositories/business.repository.js";

describe("business repository", () => {
  it("queries the public businesses table using the authenticated owner id", async () => {
    const ownerUserId = "0c4ac570-2bb2-4b8f-b8f3-bbc91a6ea2bf";
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: "business-id", owner_user_id: ownerUserId }],
        rowCount: 1,
      }),
    };

    await expect(findBusinessForOwner(db, ownerUserId)).resolves.toEqual({
      data: { id: "business-id", owner_user_id: ownerUserId },
      error: null,
      count: 1,
    });
    expect(db.query).toHaveBeenCalledWith(
      "select * from public.businesses where owner_user_id = $1",
      [ownerUserId],
    );
  });
});
