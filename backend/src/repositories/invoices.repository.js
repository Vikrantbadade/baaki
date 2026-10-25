import { withSupabaseContext } from "../utils/supabaseError.js";

export function listInvoices(supabase, businessId, { page, limit, status, customerId, from, to, financialYear }) {
  let query = supabase
    .from("invoices")
    .select("id,invoice_number,status,customer_id,issue_date,due_date,financial_year,total_paise,paid_amount_paise,outstanding_paise,currency,created_at", {
      count: "exact",
    })
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (status) query = query.eq("status", status);
  if (customerId) query = query.eq("customer_id", customerId);
  if (from) query = query.gte("issue_date", from);
  if (to) query = query.lte("issue_date", to);
  if (financialYear) query = query.eq("financial_year", financialYear);
  return withSupabaseContext(query, "select", "invoices");
}

export function getInvoice(supabase, businessId, invoiceId) {
  return withSupabaseContext(
    supabase
      .from("invoices")
      .select("*,invoice_items(*)")
      .eq("business_id", businessId)
      .eq("id", invoiceId)
      .maybeSingle(),
    "select",
    "invoices",
  );
}

export function getDraftInvoice(supabase, businessId, invoiceId) {
  return withSupabaseContext(
    supabase
      .from("invoices")
      .select("id,status")
      .eq("business_id", businessId)
      .eq("id", invoiceId)
      .maybeSingle(),
    "select",
    "invoices",
  );
}

export function createDraftInvoice(supabase, parameters) {
  return withSupabaseContext(supabase.rpc("create_draft_invoice", parameters), "rpc:create_draft_invoice", "invoices");
}

export function updateDraftInvoice(supabase, parameters) {
  return withSupabaseContext(supabase.rpc("update_draft_invoice", parameters), "rpc:update_draft_invoice", "invoices");
}

export function issueInvoice(supabase, businessId, invoiceId) {
  return withSupabaseContext(
    supabase.rpc("issue_invoice", {
      p_business_id: businessId,
      p_invoice_id: invoiceId,
    }),
    "rpc:issue_invoice",
    "invoices",
  );
}

export function cancelInvoice(supabase, businessId, invoiceId, reason) {
  return withSupabaseContext(
    supabase.rpc("cancel_invoice", {
      p_business_id: businessId,
      p_invoice_id: invoiceId,
      p_reason: reason,
    }),
    "rpc:cancel_invoice",
    "invoices",
  );
}

export function listInvoiceEvents(supabase, businessId, invoiceId, { page, limit }) {
  return withSupabaseContext(
    supabase
      .from("invoice_events")
      .select("id,event_type,reference_id,metadata,actor_user_id,created_at", { count: "exact" })
      .eq("business_id", businessId)
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * limit, page * limit - 1),
    "select",
    "invoice_events",
  );
}

export function createInvoiceDocument(supabase, document) {
  return withSupabaseContext(
    supabase.from("invoice_documents").insert(document).select("*").single(),
    "insert",
    "invoice_documents",
  );
}

export function listInvoiceDocuments(supabase, businessId, invoiceId) {
  return withSupabaseContext(
    supabase
      .from("invoice_documents")
      .select("id,invoice_id,document_type,original_filename,mime_type,byte_size,sha256,created_at")
      .eq("business_id", businessId)
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false }),
    "select",
    "invoice_documents",
  );
}

export function getInvoiceDocument(supabase, businessId, documentId) {
  return withSupabaseContext(
    supabase
      .from("invoice_documents")
      .select("id,invoice_id,document_type,original_filename,storage_key,mime_type,byte_size,sha256,created_at")
      .eq("business_id", businessId)
      .eq("id", documentId)
      .maybeSingle(),
    "select",
    "invoice_documents",
  );
}
