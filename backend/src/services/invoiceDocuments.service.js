import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import { createServiceRoleClient } from "../config/supabase.js";
import {
  createInvoiceDocument,
  getInvoiceDocument,
  listInvoiceDocuments,
} from "../repositories/invoices.repository.js";
import { throwOnSupabaseError } from "../utils/supabaseError.js";
import { getInvoiceById } from "./invoices.service.js";
import { createInvoicePdf } from "./invoicePdf.service.js";

const BUCKET = "invoice-documents";
const MAX_SIGNED_URL_SECONDS = 300;

function safeFilename(invoiceNumber) {
  const base = invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "-");
  return `${base || "invoice"}.pdf`;
}

export async function generateInvoicePdf(supabase, businessId, userId, invoiceId) {
  const invoice = await getInvoiceById(supabase, businessId, invoiceId);
  if (!invoice.issued_snapshot) {
    throw new AppError(409, "INVOICE_SNAPSHOT_UNAVAILABLE", "This issued invoice has no stored issue-time document snapshot");
  }
  const metadataClient = createServiceRoleClient();
  const snapshot = invoice.issued_snapshot;
  const content = await createInvoicePdf(snapshot, {
    status: invoice.status,
    paidAmountPaise: invoice.paid_amount_paise,
    outstandingPaise: invoice.outstanding_paise,
  });
  const documentId = randomUUID();
  const storageKey = `${businessId}/${invoiceId}/${documentId}.pdf`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storageKey, content, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    throw new AppError(503, "DOCUMENT_STORAGE_FAILED", "Invoice PDF could not be stored");
  }

  const metadata = {
    id: documentId,
    business_id: businessId,
    invoice_id: invoiceId,
    document_type: "invoice_pdf",
    original_filename: safeFilename(snapshot.invoiceNumber),
    storage_key: storageKey,
    mime_type: "application/pdf",
    byte_size: content.byteLength,
    sha256: createHash("sha256").update(content).digest("hex"),
    uploaded_by: userId,
  };
  const { error: metadataError } = await createInvoiceDocument(metadataClient, metadata);
  if (metadataError) {
    const { error: cleanupError } = await metadataClient.storage.from(BUCKET).remove([storageKey]);
    if (cleanupError) {
      throw new AppError(503, "DOCUMENT_METADATA_AND_CLEANUP_FAILED", "PDF metadata could not be saved and the temporary object could not be removed");
    }
    throwOnSupabaseError(metadataError);
  }

  return { content, filename: metadata.original_filename, documentId };
}

export async function getInvoiceDocuments(supabase, businessId, invoiceId) {
  await getInvoiceById(supabase, businessId, invoiceId);
  const { data, error } = await listInvoiceDocuments(supabase, businessId, invoiceId);
  throwOnSupabaseError(error);
  return data;
}

export async function createInvoiceDocumentDownloadUrl(supabase, businessId, documentId) {
  const { data, error } = await getInvoiceDocument(supabase, businessId, documentId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
  const { data: signed, error: signedUrlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.storage_key, MAX_SIGNED_URL_SECONDS, { download: data.original_filename });
  if (signedUrlError) throw new AppError(503, "DOCUMENT_DOWNLOAD_UNAVAILABLE", "Document download is temporarily unavailable");
  return { url: signed.signedUrl, expiresInSeconds: MAX_SIGNED_URL_SECONDS };
}
