import { createHash } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import {
  cancelInvoice,
  createDraftInvoice,
  getInvoice,
  issueInvoice,
  listInvoiceEvents,
  listInvoices,
  updateDraftInvoice,
} from "../repositories/invoices.repository.js";
import { calculateInvoiceTotals, quantityToMilli } from "../utils/money.js";
import { throwOnSupabaseError } from "../utils/supabaseError.js";
import { getCustomerById } from "./customers.service.js";
import { buildInvoiceSnapshot, renderInvoicePreviewHtml } from "./invoicePresentation.service.js";

function invoicePayload(input) {
  const totals = calculateInvoiceTotals(input.items);
  return {
    totals,
    items: totals.items.map((item) => ({
      description: item.description,
      quantity_milli: item.quantityMilli,
      unit_price_paise: item.unitPricePaise,
      discount_bps: item.discountBps,
      tax_rate_bps: item.taxRateBps,
      subtotal_paise: item.subtotalPaise,
      discount_paise: item.discountPaise,
      tax_paise: item.taxPaise,
      total_paise: item.totalPaise,
    })),
  };
}

function idempotencyParameters(req, operation) {
  const key = req.idempotencyKey;
  if (!key) {
    throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key of 8 to 128 characters");
  }
  const requestHash = createHash("sha256").update(JSON.stringify(req.validated.body)).digest("hex");
  return { key, operation, requestHash };
}

export async function previewInvoice(input) {
  return calculateInvoiceTotals(input.items);
}

export async function createInvoiceDraft(req, input) {
  await getCustomerById(req.supabase, req.business.id, input.customerId);
  const { items } = invoicePayload(input);
  const idempotency = idempotencyParameters(req, "invoice.create");
  const { data, error } = await createDraftInvoice(req.supabase, {
    p_business_id: req.business.id,
    p_customer_id: input.customerId,
    p_issue_date: input.issueDate ?? null,
    p_due_date: input.dueDate ?? null,
    p_notes: input.notes ?? null,
    p_items: items,
    p_idempotency_key: idempotency.key,
    p_request_hash: idempotency.requestHash,
  });
  throwOnSupabaseError(error);
  return getInvoiceById(req.supabase, req.business.id, data);
}

export async function getInvoices(supabase, businessId, query) {
  const { data, error, count } = await listInvoices(supabase, businessId, query);
  throwOnSupabaseError(error);
  return { items: data, page: query.page, limit: query.limit, total: count };
}

export async function getInvoiceById(supabase, businessId, invoiceId) {
  const { data, error } = await getInvoice(supabase, businessId, invoiceId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice was not found");
  return data;
}

export async function getInvoicePreview(req, invoiceId) {
  const invoice = await getInvoiceById(req.supabase, req.business.id, invoiceId);
  const customer = invoice.issued_snapshot
    ? null
    : await getCustomerById(req.supabase, req.business.id, invoice.customer_id);
  const snapshot = buildInvoiceSnapshot(invoice, req.business, customer);
  return renderInvoicePreviewHtml(snapshot, {
    status: invoice.status,
    paidAmountPaise: invoice.paid_amount_paise,
    outstandingPaise: invoice.outstanding_paise,
  });
}

export async function getInvoiceTimeline(supabase, businessId, invoiceId, query) {
  await getInvoiceById(supabase, businessId, invoiceId);
  const { data, error, count } = await listInvoiceEvents(supabase, businessId, invoiceId, query);
  throwOnSupabaseError(error);
  return { items: data, page: query.page, limit: query.limit, total: count };
}

export async function editInvoiceDraft(req, invoiceId, input) {
  const current = await getInvoiceById(req.supabase, req.business.id, invoiceId);
  if (current.status !== "draft") {
    throw new AppError(409, "INVOICE_NOT_EDITABLE", "Only draft invoices can be edited");
  }
  const merged = { ...current, ...input };
  if (input.customerId) {
    await getCustomerById(req.supabase, req.business.id, input.customerId);
  }
  const invoiceInput = {
    customerId: merged.customerId ?? current.customer_id,
    issueDate: merged.issueDate ?? merged.issue_date,
    dueDate: merged.dueDate ?? merged.due_date,
    notes: merged.notes,
    items: input.items ?? current.invoice_items.map((item) => ({
      description: item.description,
      quantityMilli: quantityToMilli(item.quantity),
      unitPricePaise: item.unit_price_paise,
      discountBps: item.discount_bps,
      taxRateBps: item.tax_rate_bps,
    })),
  };
  const { items } = invoicePayload(invoiceInput);
  const { data, error } = await updateDraftInvoice(req.supabase, {
    p_business_id: req.business.id,
    p_invoice_id: invoiceId,
    p_customer_id: invoiceInput.customerId,
    p_issue_date: invoiceInput.issueDate ?? null,
    p_due_date: invoiceInput.dueDate ?? null,
    p_notes: invoiceInput.notes ?? null,
    p_items: items,
  });
  throwOnSupabaseError(error);
  return getInvoiceById(req.supabase, req.business.id, data);
}

export async function issueInvoiceForBusiness(supabase, businessId, invoiceId) {
  const { data, error } = await issueInvoice(supabase, businessId, invoiceId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice was not found");
  return getInvoiceById(supabase, businessId, invoiceId);
}

export async function cancelInvoiceForBusiness(supabase, businessId, invoiceId, reason) {
  const { data, error } = await cancelInvoice(supabase, businessId, invoiceId, reason);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice was not found");
  return getInvoiceById(supabase, businessId, invoiceId);
}
