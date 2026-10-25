import { describe, expect, it } from "vitest";
import { createUpiQr, renderInvoicePreviewHtml } from "../../src/services/invoicePresentation.service.js";

const snapshot = {
  invoiceNumber: "2026-27-000001",
  issueDate: "2026-04-01",
  financialYear: 2026,
  currency: "INR",
  seller: { name: "Baaki", address: {}, invoiceSettings: { upiVpa: "baaki@bank", upiDisplayName: "Baaki Services" } },
  buyer: { name: '<img src=x onerror="alert(1)">', address: {} },
  items: [{
    description: "<script>alert(1)</script>",
    quantity: "1.000",
    unitPricePaise: 10000,
    discountBps: 0,
    discountPaise: 0,
    taxRateBps: 0,
    taxPaise: 0,
    totalPaise: 10000,
  }],
  totals: { subtotalPaise: 10000, discountPaise: 0, taxPaise: 0, totalPaise: 10000 },
};

describe("invoice presentation", () => {
  it("escapes untrusted invoice and customer values in the plain HTML preview", () => {
    const html = renderInvoicePreviewHtml(snapshot, {
      status: "issued",
      paidAmountPaise: 0,
      outstandingPaise: 10000,
    });

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("builds a UPI URI and a real PNG QR using only configured business data and balance", async () => {
    const invoice = { status: "partially_paid", outstanding_paise: 12550 };
    const result = await createUpiQr(invoice, snapshot);
    const parsed = new URL(result.paymentUri);

    expect(parsed.protocol).toBe("upi:");
    expect(parsed.hostname).toBe("pay");
    expect(parsed.searchParams.get("pa")).toBe("baaki@bank");
    expect(parsed.searchParams.get("pn")).toBe("Baaki Services");
    expect(parsed.searchParams.get("am")).toBe("125.50");
    expect(parsed.searchParams.get("cu")).toBe("INR");
    expect(parsed.searchParams.get("tn")).toBe("Invoice 2026-27-000001");
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.amountPaise).toBe(12550);
  });

  it("does not produce a payment QR when payment details or invoice state are invalid", async () => {
    await expect(createUpiQr(
      { status: "issued", outstanding_paise: 500 },
      { ...snapshot, seller: { ...snapshot.seller, invoiceSettings: { upiVpa: "not a vpa" } } },
    )).rejects.toMatchObject({ code: "UPI_NOT_CONFIGURED", status: 503 });
    await expect(createUpiQr(
      { status: "paid", outstanding_paise: 0 },
      snapshot,
    )).rejects.toMatchObject({ code: "INVOICE_NOT_PAYABLE", status: 409 });
  });
});
