import { withDatabaseContext } from "../utils/databaseResult.js";

export function listInvoices(db, businessId, { page, limit, status, customerId, from, to, financialYear }) {
  const values = [businessId];
  const predicates = ["business_id = $1"];
  for (const [value, column, operator = "="] of [
    [status, "status"],
    [customerId, "customer_id"],
    [from, "issue_date", ">="],
    [to, "issue_date", "<="],
    [financialYear, "financial_year"],
  ]) {
    if (value !== undefined && value !== null) {
      values.push(value);
      predicates.push(`${column} ${operator} $${values.length}`);
    }
  }
  values.push(limit, (page - 1) * limit);
  return withDatabaseContext(
    db.query(
      `select id,invoice_number,status,customer_id,issue_date,due_date,financial_year,total_paise,
       paid_amount_paise,outstanding_paise,currency,created_at,count(*) over()::integer as total_count
       from public.invoices where ${predicates.join(" and ")}
       order by created_at desc limit $${values.length - 1} offset $${values.length}`,
      values,
    ),
    "select", "invoices",
  ).then(({ data, error }) => ({
    data: data?.map(({ total_count: _total, ...row }) => row) ?? data,
    error,
    count: data?.[0]?.total_count ?? 0,
  }));
}

export function getInvoice(db, businessId, invoiceId) {
  return withDatabaseContext(
    db.query(
      `select i.*,
        coalesce((select jsonb_agg(to_jsonb(ii) order by ii.created_at)
                  from public.invoice_items ii where ii.business_id = i.business_id and ii.invoice_id = i.id), '[]'::jsonb) as invoice_items
       from public.invoices i where i.business_id = $1 and i.id = $2`,
      [businessId, invoiceId],
    ),
    "select", "invoices", { single: true },
  );
}

export function getDraftInvoice(db, businessId, invoiceId) {
  return withDatabaseContext(
    db.query("select id,status from public.invoices where business_id = $1 and id = $2", [businessId, invoiceId]),
    "select", "invoices", { single: true },
  );
}

export function createDraftInvoice(db, p) {
  return withDatabaseContext(
    db.query(
      `select public.create_draft_invoice($1,$2,$3,$4,$5,$6::jsonb,$7,$8) as result`,
      [p.p_business_id, p.p_customer_id, p.p_issue_date, p.p_due_date, p.p_notes,
        JSON.stringify(p.p_items), p.p_idempotency_key, p.p_request_hash],
    ).then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:create_draft_invoice", "invoices", { single: true },
  );
}

export function updateDraftInvoice(db, p) {
  return withDatabaseContext(
    db.query(
      `select public.update_draft_invoice($1,$2,$3,$4,$5,$6,$7::jsonb) as result`,
      [p.p_business_id, p.p_invoice_id, p.p_customer_id, p.p_issue_date, p.p_due_date, p.p_notes, JSON.stringify(p.p_items)],
    ).then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:update_draft_invoice", "invoices", { single: true },
  );
}

export function issueInvoice(db, businessId, invoiceId) {
  return withDatabaseContext(
    db.query("select public.issue_invoice($1,$2) as result", [businessId, invoiceId])
      .then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:issue_invoice", "invoices", { single: true },
  );
}

export function cancelInvoice(db, businessId, invoiceId, reason) {
  return withDatabaseContext(
    db.query("select public.cancel_invoice($1,$2,$3) as result", [businessId, invoiceId, reason])
      .then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:cancel_invoice", "invoices", { single: true },
  );
}

export function listInvoiceEvents(db, businessId, invoiceId, { page, limit }) {
  return withDatabaseContext(
    db.query(
      `select id,event_type,reference_id,metadata,actor_user_id,created_at,
       count(*) over()::integer as total_count
       from public.invoice_events where business_id = $1 and invoice_id = $2
       order by created_at desc,id desc limit $3 offset $4`,
      [businessId, invoiceId, limit, (page - 1) * limit],
    ),
    "select", "invoice_events",
  ).then(({ data, error }) => ({
    data: data?.map(({ total_count: _total, ...row }) => row) ?? data,
    error,
    count: data?.[0]?.total_count ?? 0,
  }));
}

export function createInvoiceDocument(db, document) {
  return withDatabaseContext(
    db.query(
      `insert into public.invoice_documents
       (id,business_id,invoice_id,document_type,original_filename,storage_key,mime_type,byte_size,sha256,uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [document.id, document.business_id, document.invoice_id, document.document_type, document.original_filename,
        document.storage_key, document.mime_type, document.byte_size, document.sha256, document.uploaded_by],
    ),
    "insert", "invoice_documents", { single: true },
  );
}

export function listInvoiceDocuments(db, businessId, invoiceId) {
  return withDatabaseContext(
    db.query(
      `select id,invoice_id,document_type,original_filename,mime_type,byte_size,sha256,created_at
       from public.invoice_documents where business_id = $1 and invoice_id = $2 order by created_at desc`,
      [businessId, invoiceId],
    ),
    "select", "invoice_documents",
  );
}

export function getInvoiceDocument(db, businessId, documentId) {
  return withDatabaseContext(
    db.query(
      `select id,invoice_id,document_type,original_filename,storage_key,mime_type,byte_size,sha256,created_at
       from public.invoice_documents where business_id = $1 and id = $2`,
      [businessId, documentId],
    ),
    "select", "invoice_documents", { single: true },
  );
}
