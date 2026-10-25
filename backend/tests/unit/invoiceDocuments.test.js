import { beforeEach, describe, expect, it, vi } from "vitest";

const { createInvoiceDocument, getInvoiceDocument, getInvoiceById, mkdir, writeFile, unlink, query } =
  vi.hoisted(() => ({
    createInvoiceDocument: vi.fn(),
    getInvoiceDocument: vi.fn(),
    getInvoiceById: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    query: vi.fn(),
  }));

vi.mock("../../src/repositories/invoices.repository.js", () => ({
  createInvoiceDocument,
  getInvoiceDocument,
  listInvoiceDocuments: vi.fn(),
}));
vi.mock("../../src/services/invoices.service.js", () => ({ getInvoiceById }));
vi.mock("../../src/services/invoicePdf.service.js", () => ({
  createInvoicePdf: vi.fn().mockResolvedValue(Buffer.from("%PDF-test")),
}));
vi.mock("node:fs/promises", () => ({
  mkdir,
  writeFile,
  unlink,
  readFile: vi.fn(),
}));
vi.mock("../../src/config/database.js", () => ({ pool: { query, connect: vi.fn() } }));

import {
  createInvoiceDocumentDownloadUrl,
  generateInvoicePdf,
} from "../../src/services/invoiceDocuments.service.js";

const invoice = {
  id: "invoice-id",
  status: "issued",
  issued_snapshot: { invoiceNumber: "2026-27-000001", issueDate: "2026-04-01", items: [], totals: {} },
  paid_amount_paise: 0,
  outstanding_paise: 100,
};

describe("private local invoice documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvoiceById.mockResolvedValue(invoice);
    createInvoiceDocument.mockResolvedValue({ error: null });
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    mkdir.mockResolvedValue(undefined);
    writeFile.mockResolvedValue(undefined);
    unlink.mockResolvedValue(undefined);
  });

  it("stores PDF bytes locally and persists metadata through the caller's database context", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    const result = await generateInvoicePdf(db, "business-id", "user-id", "invoice-id");

    expect(result.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.filename).toBe("2026-27-000001.pdf");
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/[0-9a-f-]+\.pdf$/),
      expect.any(Buffer),
      { flag: "wx", mode: 0o600 },
    );
    expect(createInvoiceDocument).toHaveBeenCalledWith(db, expect.objectContaining({
      business_id: "business-id",
      invoice_id: "invoice-id",
      uploaded_by: "user-id",
      mime_type: "application/pdf",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it("removes the local file when metadata persistence fails", async () => {
    createInvoiceDocument.mockResolvedValue({ error: { code: "23514" } });
    const db = { query: vi.fn() };

    await expect(generateInvoicePdf(db, "business-id", "user-id", "invoice-id"))
      .rejects.toMatchObject({ code: "INVALID_REFERENCE", status: 422 });
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it("mints a short-lived URL token only after the document is business-scoped", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    getInvoiceDocument.mockResolvedValue({
      data: { id: "document-id", original_filename: "invoice.pdf" },
      error: null,
    });

    const result = await createInvoiceDocumentDownloadUrl(db, "business-id", "user-id", "document-id");

    expect(result.url).toMatch(/^http:\/\/localhost:3000\/api\/v1\/invoices\/documents\/document-id\/content\?token=/);
    expect(result.expiresInSeconds).toBe(300);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("document_download_tokens"),
      [expect.stringMatching(/^[0-9a-f]{64}$/), "document-id", "user-id", 300],
    );
  });

  it("does not mint a token for a document outside the authenticated business", async () => {
    const db = { query: vi.fn() };
    getInvoiceDocument.mockResolvedValue({ data: null, error: null });
    await expect(createInvoiceDocumentDownloadUrl(db, "other-business", "user-id", "document-id"))
      .rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND", status: 404 });
    expect(db.query).not.toHaveBeenCalled();
  });
});
