import PDFDocument from "pdfkit";
import { AppError } from "../errors/AppError.js";

const PAGE_MARGIN = 48;
const PAGE_BOTTOM = 748;
const TABLE_COLUMNS = [
  { label: "Description", x: 50, width: 190 },
  { label: "Qty", x: 245, width: 40 },
  { label: "Unit price", x: 288, width: 75 },
  { label: "Disc. % / INR", x: 365, width: 65 },
  { label: "Tax % / INR", x: 432, width: 58 },
  { label: "Total", x: 492, width: 53 },
];

function amount(paise) {
  const value = BigInt(paise);
  const rupees = value / 100n;
  const remainder = (value % 100n).toString().padStart(2, "0");
  return `INR ${rupees.toLocaleString("en-IN")}.${remainder}`;
}

function lineAmount(paise) {
  const value = BigInt(paise);
  return `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
}

function addressText(address = {}) {
  return [address.line1, address.line2, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean)
    .join(", ");
}

function ensureRoom(doc, height, drawTableHeader) {
  if (doc.y + height > PAGE_BOTTOM) {
    doc.addPage();
    drawTableHeader();
  }
}

export async function createInvoicePdf(snapshot, paymentState) {
  if (!snapshot?.invoiceNumber || !Array.isArray(snapshot.items)) {
    throw new AppError(409, "INVOICE_SNAPSHOT_UNAVAILABLE", "This issued invoice has no stored issue-time document snapshot");
  }

  const document = new PDFDocument({
    size: "A4",
    margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    bufferPages: true,
    info: {
      Title: `Invoice ${snapshot.invoiceNumber}`,
      CreationDate: new Date(`${snapshot.issueDate}T00:00:00.000Z`),
    },
  });
  const chunks = [];
  const bufferPromise = new Promise((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.font("Helvetica-Bold").fontSize(19).text(snapshot.seller?.legalName || snapshot.seller?.name || "Business");
  document.font("Helvetica").fontSize(10);
  const sellerAddress = addressText(snapshot.seller?.address);
  if (sellerAddress) document.text(sellerAddress);
  if (snapshot.seller?.gstin) document.text(`GSTIN: ${snapshot.seller.gstin}`);
  document.moveDown();
  document.font("Helvetica-Bold").fontSize(16).text("INVOICE");
  document.font("Helvetica").fontSize(10);
  document.text(`Invoice number: ${snapshot.invoiceNumber}`);
  document.text(`Issue date: ${snapshot.issueDate}`);
  if (snapshot.dueDate) document.text(`Due date: ${snapshot.dueDate}`);
  document.text(`Financial year: ${snapshot.financialYear}-${String(snapshot.financialYear + 1).slice(-2)}`);
  document.moveDown();
  document.font("Helvetica-Bold").text("Bill to");
  document.font("Helvetica").text(snapshot.buyer?.name || "Customer");
  const buyerAddress = addressText(snapshot.buyer?.address);
  if (buyerAddress) document.text(buyerAddress);
  if (snapshot.buyer?.taxId) document.text(`Tax ID: ${snapshot.buyer.taxId}`);
  if (snapshot.seller?.invoiceSettings?.upiVpa) {
    document.text(`Payment instructions: UPI to ${snapshot.seller.invoiceSettings.upiVpa}`);
  }
  document.moveDown();
  document.text("All line-item amounts are INR.");

  function drawTableHeader() {
    const y = document.y;
    document.font("Helvetica-Bold").fontSize(9);
    for (const column of TABLE_COLUMNS) document.text(column.label, column.x, y, { width: column.width });
    document.moveTo(50, y + 15).lineTo(545, y + 15).stroke();
    document.y = y + 22;
    document.font("Helvetica").fontSize(8);
  }

  drawTableHeader();
  for (const item of snapshot.items) {
    const discountText = `${(item.discountBps / 100).toFixed(2)}%\n${lineAmount(item.discountPaise)}`;
    const taxText = `${(item.taxRateBps / 100).toFixed(2)}%\n${lineAmount(item.taxPaise)}`;
    const rowHeight = Math.max(
      26,
      document.heightOfString(item.description, { width: TABLE_COLUMNS[0].width }),
      document.heightOfString(discountText, { width: TABLE_COLUMNS[3].width }),
      document.heightOfString(taxText, { width: TABLE_COLUMNS[4].width }),
    );
    ensureRoom(document, rowHeight + 8, drawTableHeader);
    const y = document.y;
    document.text(item.description, TABLE_COLUMNS[0].x, y, { width: TABLE_COLUMNS[0].width });
    document.text(String(item.quantity), TABLE_COLUMNS[1].x, y, { width: TABLE_COLUMNS[1].width });
    document.text(lineAmount(item.unitPricePaise), TABLE_COLUMNS[2].x, y, { width: TABLE_COLUMNS[2].width });
    document.text(discountText, TABLE_COLUMNS[3].x, y, { width: TABLE_COLUMNS[3].width });
    document.text(taxText, TABLE_COLUMNS[4].x, y, { width: TABLE_COLUMNS[4].width });
    document.text(lineAmount(item.totalPaise), TABLE_COLUMNS[5].x, y, { width: TABLE_COLUMNS[5].width });
    document.y = y + rowHeight + 8;
  }

  ensureRoom(document, 100, drawTableHeader);
  document.moveDown();
  document.font("Helvetica-Bold");
  document.text(`Subtotal: ${amount(snapshot.totals.subtotalPaise)}`, { align: "right" });
  document.text(`Discount: ${amount(snapshot.totals.discountPaise)}`, { align: "right" });
  document.text(`Tax: ${amount(snapshot.totals.taxPaise)}`, { align: "right" });
  document.fontSize(12).text(`Total: ${amount(snapshot.totals.totalPaise)}`, { align: "right" });
  document.fontSize(10).font("Helvetica");
  document.moveDown();
  document.text(`Payment status: ${paymentState.status}`);
  document.text(`Paid: ${amount(paymentState.paidAmountPaise)}`);
  document.text(`Outstanding: ${amount(paymentState.outstandingPaise)}`);
  if (snapshot.notes) {
    document.moveDown();
    document.font("Helvetica-Bold").text("Notes");
    document.font("Helvetica").text(snapshot.notes, { width: 495 });
  }

  const range = document.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(range.start + index);
    document.font("Helvetica").fontSize(8).text(`Page ${index + 1} of ${range.count}`, 50, PAGE_BOTTOM + 32, {
      width: 495,
      align: "center",
    });
  }

  document.end();
  return bufferPromise;
}
