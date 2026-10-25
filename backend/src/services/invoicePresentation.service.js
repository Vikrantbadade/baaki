import { URLSearchParams } from "node:url";
import QRCode from "qrcode";
import { AppError } from "../errors/AppError.js";

const VPA_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,253}@[A-Za-z0-9][A-Za-z0-9.-]{1,62}$/;

function amount(paise) {
  const value = BigInt(paise);
  return `INR ${(value / 100n).toLocaleString("en-IN")}.${(value % 100n).toString().padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatAddress(address = {}) {
  return [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean)
    .map(escapeHtml)
    .join(", ");
}

function currentInvoiceSnapshot(invoice, business, customer) {
  return {
    invoiceNumber: invoice.invoice_number || "DRAFT",
    documentType: "commercial",
    status: invoice.status,
    issueDate: invoice.issue_date || "Not set",
    dueDate: invoice.due_date,
    financialYear: invoice.financial_year,
    currency: invoice.currency,
    notes: invoice.notes,
    totals: {
      subtotalPaise: invoice.subtotal_paise,
      discountPaise: invoice.discount_paise,
      taxPaise: invoice.tax_paise,
      totalPaise: invoice.total_paise,
    },
    seller: {
      name: business.name,
      legalName: business.legal_name,
      gstin: business.gstin,
      address: business.address,
      invoiceSettings: {
        upiVpa: business.invoice_settings?.upiVpa,
        upiDisplayName: business.invoice_settings?.upiDisplayName,
      },
    },
    buyer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      taxId: customer.tax_id,
      address: customer.address,
    },
    items: invoice.invoice_items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPricePaise: item.unit_price_paise,
      discountBps: item.discount_bps,
      taxRateBps: item.tax_rate_bps,
      subtotalPaise: item.subtotal_paise,
      discountPaise: item.discount_paise,
      taxPaise: item.tax_paise,
      totalPaise: item.total_paise,
    })),
  };
}

export function buildInvoiceSnapshot(invoice, business, customer) {
  return invoice.issued_snapshot ?? currentInvoiceSnapshot(invoice, business, customer);
}

export function renderInvoicePreviewHtml(snapshot, paymentState) {
  const itemRows = snapshot.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${amount(item.unitPricePaise)}</td>
      <td>${(item.discountBps / 100).toFixed(2)}% / ${amount(item.discountPaise)}</td>
      <td>${(item.taxRateBps / 100).toFixed(2)}% / ${amount(item.taxPaise)}</td>
      <td>${amount(item.totalPaise)}</td>
    </tr>`).join("");
  const businessName = escapeHtml(snapshot.seller?.legalName || snapshot.seller?.name || "Business");
  const customerName = escapeHtml(snapshot.buyer?.name || "Customer");
  const sellerAddress = formatAddress(snapshot.seller?.address);
  const buyerAddress = formatAddress(snapshot.buyer?.address);

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice ${escapeHtml(snapshot.invoiceNumber)}</title></head>
<body>
  <header><h1>${businessName}</h1><p>${sellerAddress}</p><p>${snapshot.seller?.gstin ? `GSTIN: ${escapeHtml(snapshot.seller.gstin)}` : ""}</p></header>
  <main>
    <h2>Invoice ${escapeHtml(snapshot.invoiceNumber)}</h2>
    <p>Status: ${escapeHtml(paymentState.status)} | Issue date: ${escapeHtml(snapshot.issueDate)}${snapshot.dueDate ? ` | Due date: ${escapeHtml(snapshot.dueDate)}` : ""}</p>
    <section><h3>Bill to</h3><p>${customerName}</p><p>${buyerAddress}</p><p>${snapshot.buyer?.taxId ? `Tax ID: ${escapeHtml(snapshot.buyer.taxId)}` : ""}</p></section>
    ${snapshot.seller?.invoiceSettings?.upiVpa ? `<p>Payment instructions: UPI to ${escapeHtml(snapshot.seller.invoiceSettings.upiVpa)}</p>` : ""}
    <table>
      <thead><tr><th>Description</th><th>Quantity</th><th>Unit price</th><th>Discount</th><th>Tax</th><th>Total</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    <p>Subtotal: ${amount(snapshot.totals.subtotalPaise)}</p>
    <p>Discount: ${amount(snapshot.totals.discountPaise)}</p>
    <p>Tax: ${amount(snapshot.totals.taxPaise)}</p>
    <p>Total: ${amount(snapshot.totals.totalPaise)}</p>
    <p>Paid: ${amount(paymentState.paidAmountPaise)}</p>
    <p>Outstanding: ${amount(paymentState.outstandingPaise)}</p>
    ${snapshot.notes ? `<section><h3>Notes</h3><p>${escapeHtml(snapshot.notes)}</p></section>` : ""}
  </main>
</body>
</html>`;
}

function formatRupees(paise) {
  const value = BigInt(paise);
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

export async function createUpiQr(invoice, snapshot) {
  if (!["issued", "partially_paid"].includes(invoice.status) || invoice.outstanding_paise <= 0) {
    throw new AppError(409, "INVOICE_NOT_PAYABLE", "Only issued invoices with an outstanding balance can show UPI payment details");
  }
  const settings = snapshot.seller?.invoiceSettings ?? {};
  const vpa = typeof settings.upiVpa === "string" ? settings.upiVpa.trim() : "";
  const payeeName = typeof settings.upiDisplayName === "string" ? settings.upiDisplayName.trim() : "";
  if (!VPA_PATTERN.test(vpa) || !payeeName || payeeName.length > 100) {
    throw new AppError(503, "UPI_NOT_CONFIGURED", "Set a valid UPI VPA and display name in business invoice settings");
  }

  const uri = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: formatRupees(invoice.outstanding_paise),
    cu: "INR",
    tn: `Invoice ${snapshot.invoiceNumber}`.slice(0, 80),
  });
  const paymentUri = `upi://pay?${uri.toString()}`;
  const dataUrl = await QRCode.toDataURL(paymentUri, {
    errorCorrectionLevel: "M",
    type: "image/png",
    margin: 2,
  });
  return { paymentUri, dataUrl, amountPaise: invoice.outstanding_paise, currency: "INR" };
}
