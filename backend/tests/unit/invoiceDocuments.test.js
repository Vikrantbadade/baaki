import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createInvoiceDocument,
  getInvoiceDocument,
  getInvoiceById,
  createServiceRoleClient,
} = vi.hoisted(() => ({
  createInvoiceDocument: vi.fn(),
  getInvoiceDocument: vi.fn(),
  getInvoiceById: vi.fn(),
  createServiceRoleClient: vi.fn(),
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
vi.mock("../../src/config/supabase.js", () => ({ createServiceRoleClient }));

import {
  createInvoiceDocumentDownloadUrl,
  generateInvoicePdf,
} from "../../src/services/invoiceDocuments.service.js";

const invoice = {
  id: "invoice-id",
  status: "issued",
  issued_snapshot: {
    invoiceNumber: "2026-27-000001",
    issueDate: "2026-04-01",
    items: [],
    totals: {},
  },
  paid_amount_paise: 0,
  outstanding_paise: 100,
};

describe("private invoice documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInvoiceById.mockResolvedValue(invoice);
    createInvoiceDocument.mockResolvedValue({ error: null });
  });

  it("stores generated PDFs under the authorized business/invoice path with metadata", async () => {
    const adminClient = { storage: { from: vi.fn(() => ({ remove: vi.fn() })) } };
    createServiceRoleClient.mockReturnValue(adminClient);
    const storage = {
      upload: vi.fn().mockResolvedValue({ error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    };
    const userClient = { storage: { from: vi.fn(() => storage) } };

    const result = await generateInvoicePdf(userClient, "business-id", "user-id", "invoice-id");

    expect(result.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.filename).toBe("2026-27-000001.pdf");
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^business-id\/invoice-id\/[0-9a-f-]+\.pdf$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/pdf", upsert: false }),
    );
    expect(createInvoiceDocument).toHaveBeenCalledWith(adminClient, expect.objectContaining({
      business_id: "business-id",
      invoice_id: "invoice-id",
      uploaded_by: "user-id",
      mime_type: "application/pdf",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
  });

  it("does not create a storage object when privileged metadata configuration is missing", async () => {
    createServiceRoleClient.mockImplementation(() => {
      throw Object.assign(new Error("not configured"), { code: "SUPABASE_ADMIN_NOT_CONFIGURED", status: 503 });
    });
    const upload = vi.fn();
    const userClient = { storage: { from: vi.fn(() => ({ upload })) } };

    await expect(generateInvoicePdf(userClient, "business-id", "user-id", "invoice-id"))
      .rejects.toMatchObject({ code: "SUPABASE_ADMIN_NOT_CONFIGURED", status: 503 });
    expect(upload).not.toHaveBeenCalled();
  });

  it("removes an uploaded object when metadata persistence fails", async () => {
    const adminRemove = vi.fn().mockResolvedValue({ error: null });
    const adminClient = { storage: { from: vi.fn(() => ({ remove: adminRemove })) } };
    createServiceRoleClient.mockReturnValue(adminClient);
    createInvoiceDocument.mockResolvedValue({ error: { code: "23514" } });
    const storage = {
      upload: vi.fn().mockResolvedValue({ error: null }),
    };
    const userClient = { storage: { from: vi.fn(() => storage) } };

    await expect(generateInvoicePdf(userClient, "business-id", "user-id", "invoice-id"))
      .rejects.toMatchObject({ code: "INVALID_REFERENCE", status: 422 });
    expect(adminRemove).toHaveBeenCalledWith([expect.stringMatching(/^business-id\/invoice-id\//)]);
  });

  it("authorizes a document lookup by the server-derived business before signing a URL", async () => {
    const storage = { createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.test/signed" }, error: null }) };
    const supabase = { storage: { from: vi.fn(() => storage) } };
    getInvoiceDocument.mockResolvedValue({
      data: { id: "document-id", storage_key: "business-id/invoice-id/document-id.pdf", original_filename: "invoice.pdf" },
      error: null,
    });

    const result = await createInvoiceDocumentDownloadUrl(supabase, "business-id", "document-id");

    expect(getInvoiceDocument).toHaveBeenCalledWith(supabase, "business-id", "document-id");
    expect(storage.createSignedUrl).toHaveBeenCalledWith(
      "business-id/invoice-id/document-id.pdf",
      300,
      { download: "invoice.pdf" },
    );
    expect(result.expiresInSeconds).toBe(300);
  });

  it("does not sign a URL for a document outside the caller's business", async () => {
    const createSignedUrl = vi.fn();
    getInvoiceDocument.mockResolvedValue({ data: null, error: null });
    const supabase = { storage: { from: vi.fn(() => ({ createSignedUrl })) } };

    await expect(createInvoiceDocumentDownloadUrl(supabase, "other-business", "document-id"))
      .rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND", status: 404 });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
