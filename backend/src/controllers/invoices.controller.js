import * as invoices from "../services/invoices.service.js";
import * as invoiceDocuments from "../services/invoiceDocuments.service.js";
import { createUpiQr } from "../services/invoicePresentation.service.js";
import { AppError } from "../errors/AppError.js";

function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: { requestId: req.id } });
}

export async function previewInvoice(req, res) {
  send(res, req, await invoices.previewInvoice(req.validated.body));
}

export async function createInvoice(req, res) {
  send(res, req, await invoices.createInvoiceDraft(req, req.validated.body), 201);
}

export async function listInvoices(req, res) {
  send(res, req, await invoices.getInvoices(req.supabase, req.business.id, req.validated.query));
}

export async function getInvoice(req, res) {
  send(
    res,
    req,
    await invoices.getInvoiceById(req.supabase, req.business.id, req.validated.params.invoiceId),
  );
}

export async function updateInvoice(req, res) {
  send(
    res,
    req,
    await invoices.editInvoiceDraft(req, req.validated.params.invoiceId, req.validated.body),
  );
}

export async function issueInvoice(req, res) {
  send(
    res,
    req,
    await invoices.issueInvoiceForBusiness(req.supabase, req.business.id, req.validated.params.invoiceId),
  );
}

export async function cancelInvoice(req, res) {
  send(
    res,
    req,
    await invoices.cancelInvoiceForBusiness(
      req.supabase,
      req.business.id,
      req.validated.params.invoiceId,
      req.validated.body.reason,
    ),
  );
}

export async function previewInvoiceDocument(req, res) {
  const html = await invoices.getInvoicePreview(req, req.validated.params.invoiceId);
  res.type("html").send(html);
}

export async function downloadInvoicePdf(req, res) {
  const { content, filename } = await invoiceDocuments.generateInvoicePdf(
    req.supabase,
    req.business.id,
    req.user.id,
    req.validated.params.invoiceId,
  );
  res
    .status(200)
    .type("application/pdf")
    .set("Content-Disposition", `attachment; filename="${filename}"`)
    .send(content);
}

export async function getInvoiceUpiQr(req, res) {
  const invoice = await invoices.getInvoiceById(
    req.supabase,
    req.business.id,
    req.validated.params.invoiceId,
  );
  const snapshot = invoice.issued_snapshot;
  if (!snapshot) {
    throw new AppError(409, "INVOICE_SNAPSHOT_UNAVAILABLE", "UPI payment details are available only for issued invoices");
  }
  const data = await createUpiQr(invoice, snapshot);
  send(res, req, data);
}

export async function listInvoiceDocuments(req, res) {
  const data = await invoiceDocuments.getInvoiceDocuments(
    req.supabase,
    req.business.id,
    req.validated.params.invoiceId,
  );
  send(res, req, data);
}

export async function getInvoiceDocumentDownload(req, res) {
  const data = await invoiceDocuments.createInvoiceDocumentDownloadUrl(
    req.supabase,
    req.business.id,
    req.validated.params.documentId,
  );
  send(res, req, data);
}

export async function getInvoiceTimeline(req, res) {
  send(
    res,
    req,
    await invoices.getInvoiceTimeline(
      req.supabase,
      req.business.id,
      req.validated.params.invoiceId,
      req.validated.query,
    ),
  );
}
