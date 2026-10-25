import { describe, expect, it } from "vitest";
import { createInvoicePdf } from "../../src/services/invoicePdf.service.js";

describe("invoice PDF generation", () => {
  it("generates a PDF from the immutable snapshot and handles multi-page invoices", async () => {
    const snapshot = {
      invoiceNumber: "2026-27-000001",
      issueDate: "2026-04-01",
      dueDate: "2026-04-30",
      financialYear: 2026,
      seller: { name: "Test seller", address: { city: "Pune" } },
      buyer: { name: "Test buyer", address: { country: "IN" } },
      items: Array.from({ length: 100 }, (_, index) => ({
        description: `Item ${index + 1}`,
        quantity: "1.000",
        unitPricePaise: 10100,
        discountBps: 0,
        discountPaise: 0,
        taxRateBps: 500,
        taxPaise: 500,
        totalPaise: 10600,
      })),
      totals: { subtotalPaise: 1010000, discountPaise: 0, taxPaise: 50000, totalPaise: 1060000 },
    };

    const content = await createInvoicePdf(snapshot, {
      status: "partially_paid",
      paidAmountPaise: 10000,
      outstandingPaise: 1050000,
    });

    expect(content.subarray(0, 8).toString("ascii")).toBe("%PDF-1.3");
    expect(content.byteLength).toBeGreaterThan(1000);
  });

  it("refuses to fabricate PDFs for invoices without an issue-time snapshot", async () => {
    await expect(createInvoicePdf({}, {
      status: "issued",
      paidAmountPaise: 0,
      outstandingPaise: 100,
    })).rejects.toMatchObject({ code: "INVOICE_SNAPSHOT_UNAVAILABLE", status: 409 });
  });
});
