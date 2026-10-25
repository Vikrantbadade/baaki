import { describe, expect, it } from "vitest";
import {
  calculateProbabilityTargetMet,
  generateCollectionPlansAlgorithm,
} from "../../src/services/collectionPlanner.service.js";

describe("Collection Planner Algorithm", () => {
  const sampleInvoices = [
    {
      invoiceId: "INV-001",
      customerId: "cust-a",
      customerName: "Customer A",
      outstandingPaise: 450000, // ₹4,500
      expectedDaysToPay: 1,
      paymentProbability: 0.8,
      disputed: false,
      paused: false,
    },
    {
      invoiceId: "INV-002",
      customerId: "cust-b",
      customerName: "Customer B",
      outstandingPaise: 200000, // ₹2,000
      expectedDaysToPay: 1,
      paymentProbability: 0.7,
      disputed: false,
      paused: false,
    },
    {
      invoiceId: "INV-003",
      customerId: "cust-c",
      customerName: "Customer C",
      outstandingPaise: 150000, // ₹1,500
      expectedDaysToPay: 2,
      paymentProbability: 0.9,
      disputed: false,
      paused: false,
    },
    {
      invoiceId: "INV-004",
      customerId: "cust-d",
      customerName: "Customer D",
      outstandingPaise: 100000, // ₹1,000
      expectedDaysToPay: 5, // after deadline if deadline is 2 days
      paymentProbability: 0.85,
      disputed: false,
      paused: false,
    },
    {
      invoiceId: "INV-005",
      customerId: "cust-e",
      customerName: "Customer E",
      outstandingPaise: 75000, // ₹750
      expectedDaysToPay: 2,
      paymentProbability: 0.6,
      disputed: false,
      paused: false,
    },
    {
      invoiceId: "INV-006",
      customerId: "cust-f",
      customerName: "Customer F",
      outstandingPaise: 300000, // ₹3,000
      expectedDaysToPay: 1,
      paymentProbability: 0.7,
      disputed: true, // disputed!
      paused: false,
    },
    {
      invoiceId: "INV-007",
      customerId: "cust-g",
      customerName: "Customer G",
      outstandingPaise: 300000, // ₹3,000
      expectedDaysToPay: 1,
      paymentProbability: 0.7,
      disputed: false,
      paused: false,
    },
  ];

  describe("calculateProbabilityTargetMet", () => {
    it("returns 1.0 if single customer pays target with probability 1.0", () => {
      const group = [{ outstandingPaise: 100000, paymentProbability: 1.0 }];
      expect(calculateProbabilityTargetMet(group, 100000)).toBe(1.0);
    });

    it("returns correct scenario probability for two customers", () => {
      // Customer 1: 50,000 paise, p=0.8
      // Customer 2: 50,000 paise, p=0.5
      // Target: 100,000 paise (needs both to pay)
      // P(both) = 0.8 * 0.5 = 0.40
      const group = [
        { outstandingPaise: 50000, paymentProbability: 0.8 },
        { outstandingPaise: 50000, paymentProbability: 0.5 },
      ];
      expect(calculateProbabilityTargetMet(group, 100000)).toBeCloseTo(0.4, 2);
    });

    it("returns correct probability when either customer can cover target", () => {
      // Customer 1: 100,000 paise, p=0.8
      // Customer 2: 100,000 paise, p=0.5
      // Target: 100,000 paise (needs at least one to pay)
      // 1 - P(neither) = 1 - (0.2 * 0.5) = 0.90
      const group = [
        { outstandingPaise: 100000, paymentProbability: 0.8 },
        { outstandingPaise: 100000, paymentProbability: 0.5 },
      ];
      expect(calculateProbabilityTargetMet(group, 100000)).toBeCloseTo(0.9, 2);
    });
  });

  describe("generateCollectionPlansAlgorithm", () => {
    it("excludes disputed, paused, zero balance and post-deadline invoices", () => {
      const result = generateCollectionPlansAlgorithm(
        sampleInvoices,
        700000, // ₹7,000 target
        2, // 2 days deadline
      );

      // INV-004 is expected in 5 days (deadline is 2 days) -> excluded
      // INV-006 is disputed -> excluded
      // Eligible: INV-001 (450k), INV-002 (200k), INV-003 (150k), INV-005 (75k), INV-007 (300k)
      expect(result.eligibleCount).toBe(5);
      expect(result.options.length).toBeGreaterThan(0);

      const allIncludedInvoiceIds = result.options.flatMap((o) => o.invoiceIds);
      expect(allIncludedInvoiceIds).not.toContain("INV-004");
      expect(allIncludedInvoiceIds).not.toContain("INV-006");
    });

    it("generates distinct recommendation strategies", () => {
      const result = generateCollectionPlansAlgorithm(
        sampleInvoices,
        700000, // ₹7,000
        2, // 2 days
      );

      expect(result.options.length).toBeGreaterThanOrEqual(2);
      const strategies = result.options.map((o) => o.strategy);

      expect(strategies).toContain("Fewest customers to contact");
      expect(strategies).toContain("Highest estimated chance of reaching target");

      // Check Option 1 (Fewest customers):
      const opt1 = result.options.find((o) => o.strategy === "Fewest customers to contact");
      expect(opt1.customerCount).toBeLessThanOrEqual(3);
      expect(opt1.amountIfAllPayPaise).toBeGreaterThanOrEqual(700000);
      expect(opt1.isDemoPrediction).toBe(true);
    });

    it("reports shortfall when target exceeds total eligible outstanding balance", () => {
      const result = generateCollectionPlansAlgorithm(
        sampleInvoices,
        5000000, // ₹50,000 (exceeds all eligible invoices)
        2,
      );

      expect(result.options).toHaveLength(0);
      expect(result.shortfallPaise).toBeGreaterThan(0);
      expect(result.totalEligiblePaise).toBeLessThan(5000000);
    });
  });
});
