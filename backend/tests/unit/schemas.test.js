import { describe, expect, it } from "vitest";
import {
  customerCreateSchema,
  invoiceCreateSchema,
  invoiceListSchema,
  invoicePreviewSchema,
} from "../../src/schemas/api.schemas.js";

const baseRequest = {
  params: {},
  query: {},
};

describe("request schemas", () => {
  it("rejects client-provided owner IDs on customer creation", () => {
    const result = customerCreateSchema.safeParse({
      ...baseRequest,
      body: { name: "Customer", ownerUserId: "00000000-0000-4000-8000-000000000001" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects client-supplied invoice totals", () => {
    const result = invoicePreviewSchema.safeParse({
      ...baseRequest,
      body: {
        items: [
          {
            description: "Service",
            quantityMilli: 1000,
            unitPricePaise: 10000,
            discountBps: 0,
            taxRateBps: 0,
            totalPaise: 1,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid invoice quantity precision and negative prices", () => {
    const result = invoicePreviewSchema.safeParse({
      ...baseRequest,
      body: {
        items: [
          {
            description: "Service",
            quantityMilli: 0,
            unitPricePaise: -1,
            discountBps: 0,
            taxRateBps: 0,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("validates invoice filters and date ordering", () => {
    const valid = invoiceListSchema.safeParse({
      params: {},
      query: { from: "2026-04-01", to: "2027-03-31", financialYear: "2026" },
      body: {},
    });
    expect(valid.success).toBe(true);
    expect(valid.data.query.financialYear).toBe(2026);

    const invalid = invoiceListSchema.safeParse({
      params: {},
      query: { from: "2027-03-31", to: "2026-04-01" },
      body: {},
    });
    expect(invalid.success).toBe(false);
  });

  it("rejects invoice due dates earlier than issue dates", () => {
    const result = invoiceCreateSchema.safeParse({
      params: {},
      query: {},
      body: {
        customerId: "00000000-0000-4000-8000-000000000001",
        issueDate: "2026-04-02",
        dueDate: "2026-04-01",
        items: [{
          description: "Service",
          quantityMilli: 1000,
          unitPricePaise: 10000,
          discountBps: 0,
          taxRateBps: 0,
        }],
      },
    });
    expect(result.success).toBe(false);
  });
});
