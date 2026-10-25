import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../errors/AppError.js";
import { env } from "../config/env.js";
import { pool } from "../config/database.js";
import {
  createInvoiceDocument,
  getInvoiceDocument,
  listInvoiceDocuments,
} from "../repositories/invoices.repository.js";
import {
  getDatabaseErrorContext,
  throwOnDatabaseError,
  withDatabaseOperation,
} from "../utils/databaseResult.js";
import { getInvoiceById } from "./invoices.service.js";
import { createInvoicePdf } from "./invoicePdf.service.js";

const DOCUMENT_DIRECTORY = path.resolve(
  process.env.INVOICE_DOCUMENTS_DIRECTORY ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../../storage/invoice-documents"),
);
const DOWNLOAD_TOKEN_TTL_SECONDS = 300;

function safeFilename(invoiceNumber) {
  const base = invoiceNumber.replace(/[^A-Za-z0-9_-]/g, "-");
  return `${base || "invoice"}.pdf`;
}

function objectPath(businessId, invoiceId, documentId) {
  return path.join(DOCUMENT_DIRECTORY, businessId, invoiceId, `${documentId}.pdf`);
}

export async function generateInvoicePdf(db, businessId, userId, invoiceId) {
  const invoice = await getInvoiceById(db, businessId, invoiceId);
  if (!invoice.issued_snapshot) {
    throw new AppError(409, "INVOICE_SNAPSHOT_UNAVAILABLE", "This issued invoice has no stored issue-time document snapshot");
  }
  const snapshot = invoice.issued_snapshot;
  const content = await createInvoicePdf(snapshot, {
    status: invoice.status,
    paidAmountPaise: invoice.paid_amount_paise,
    outstandingPaise: invoice.outstanding_paise,
  });
  const documentId = randomUUID();
  const storageKey = `${businessId}/${invoiceId}/${documentId}.pdf`;
  const filePath = objectPath(businessId, invoiceId, documentId);
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

  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, content, { flag: "wx", mode: 0o600 });
  const { error } = await createInvoiceDocument(db, metadata);
  if (error) {
    try {
      await unlink(filePath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        const cleanupAppError = new AppError(
          503,
          "DOCUMENT_METADATA_AND_CLEANUP_FAILED",
          "PDF metadata could not be saved and the temporary document could not be removed",
        );
        cleanupAppError.cause = error;
        cleanupAppError.databaseContext = getDatabaseErrorContext(error);
        throw cleanupAppError;
      }
    }
    throwOnDatabaseError(error);
  }
  return { content, filename: metadata.original_filename, documentId };
}

export async function getInvoiceDocuments(db, businessId, invoiceId) {
  await getInvoiceById(db, businessId, invoiceId);
  const { data, error } = await listInvoiceDocuments(db, businessId, invoiceId);
  throwOnDatabaseError(error);
  return data;
}

export async function createInvoiceDocumentDownloadUrl(db, businessId, userId, documentId) {
  const { data, error } = await getInvoiceDocument(db, businessId, documentId);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document was not found");

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await withDatabaseOperation(
    db.query(
      `insert into public.document_download_tokens (token_hash,document_id,user_id,expires_at)
       values ($1,$2,$3,now() + ($4::integer * interval '1 second'))`,
      [tokenHash, documentId, userId, DOWNLOAD_TOKEN_TTL_SECONDS],
    ),
    "insert",
    "document_download_tokens",
  );
  const url = new URL(
    `/api/v1/invoices/documents/${encodeURIComponent(documentId)}/content?token=${encodeURIComponent(token)}`,
    env.APP_BASE_URL,
  );
  return { url: url.toString(), expiresInSeconds: DOWNLOAD_TOKEN_TTL_SECONDS };
}

export async function consumeInvoiceDocumentDownloadToken(documentId, token) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query("begin");
    transactionStarted = true;
    let result;
    try {
      result = await client.query(
        `delete from public.document_download_tokens t
         using public.invoice_documents d
         where t.document_id = d.id and t.document_id = $1 and t.token_hash = $2 and t.expires_at > now()
         returning d.business_id,d.invoice_id,d.id,d.original_filename,d.storage_key`,
        [documentId, tokenHash],
      );
    } catch (error) {
      error.databaseContext = { operation: "consume", table: "document_download_tokens" };
      throw error;
    }
    if (!result.rows[0]) {
      await client.query("rollback");
      transactionStarted = false;
      throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document was not found");
    }
    const document = result.rows[0];
    const content = await readFile(objectPath(document.business_id, document.invoice_id, document.id));
    await client.query("commit");
    return { content, filename: document.original_filename };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("rollback");
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
