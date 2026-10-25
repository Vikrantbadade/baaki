import { describe, expect, it } from "vitest";
import { calculateInvoiceTotals, projectCashflow, quantityToMilli } from "../../src/utils/money.js";

describe("money calculations", () => {
  it("uses integer paise and half-up rounding for quantities, discounts, and tax", () => {
    const result = calculateInvoiceTotals([
      {
        description: "Fractional item",
        quantityMilli: 1500,
        unitPricePaise: 101,
        discountBps: 1000,
        taxRateBps: 500,
      },
    ]);

    expect(result).toMatchObject({
      subtotalPaise: 152,
      discountPaise: 15,
      taxPaise: 7,
      totalPaise: 144,
    });
    expect(result.items[0].totalPaise).toBe(144);
  });

  it("converts persisted decimal quantities without floating point arithmetic", () => {
    expect(quantityToMilli("12.345")).toBe(12345);
    expect(() => quantityToMilli("1.0001")).toThrow();
  });

  it("reports the first shortage date and maximum projected cash gap", () => {
    const result = projectCashflow(
      1000,
      [
        { due_date: "2026-01-02", direction: "outflow", amount_paise: 1500, is_actual: false },
        { due_date: "2026-01-03", direction: "inflow", amount_paise: 250, is_actual: false },
      ],
      3,
      "2026-01-01",
    );

    expect(result.shortageDate).toBe("2026-01-02");
    expect(result.cashGapPaise).toBe(500);
    expect(result.dailyBalances.map((day) => day.projectedBalancePaise)).toEqual([1000, -500, -250]);
    expect(result.dailyBalances[1].estimatedOutflowPaise).toBe(1500);
    expect(result.isEstimate).toBe(true);
  });
});
