import { withDatabaseContext } from "../utils/databaseResult.js";

export function listPayments(db, businessId, { page, limit }) {
  return withDatabaseContext(
    db.query(
      `select id,customer_id,amount_paise,currency,method,source,status,received_at,created_at,
       count(*) over()::integer as total_count
       from public.payments where business_id = $1 order by received_at desc limit $2 offset $3`,
      [businessId, limit, (page - 1) * limit],
    ),
    "select", "payments",
  ).then(({ data, error }) => ({
    data: data?.map(({ total_count: _total, ...row }) => row) ?? data,
    error,
    count: data?.[0]?.total_count ?? 0,
  }));
}

export function getPayment(db, businessId, paymentId) {
  return withDatabaseContext(
    db.query(
      `select p.*,
       coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at)
                 from public.payment_allocations a where a.business_id = p.business_id and a.payment_id = p.id), '[]'::jsonb) as payment_allocations
       from public.payments p where p.business_id = $1 and p.id = $2`,
      [businessId, paymentId],
    ),
    "select", "payments", { single: true },
  );
}

export function recordManualPayment(db, p) {
  return withDatabaseContext(
    db.query(
      "select public.record_manual_payment($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) as result",
      [p.p_business_id, p.p_customer_id, p.p_amount_paise, p.p_method, p.p_received_at,
        p.p_reference, JSON.stringify(p.p_allocations), p.p_idempotency_key, p.p_request_hash],
    ).then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:record_manual_payment", "payments", { single: true },
  );
}

export function allocatePayment(db, p) {
  return withDatabaseContext(
    db.query(
      "select public.allocate_payment($1,$2,$3::jsonb,$4,$5) as result",
      [p.p_business_id, p.p_payment_id, JSON.stringify(p.p_allocations), p.p_idempotency_key, p.p_request_hash],
    ).then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:allocate_payment", "payment_allocations", { single: true },
  );
}

export function listPaymentAllocations(db, businessId, paymentId) {
  return withDatabaseContext(
    db.query(
      `select a.*, jsonb_build_object('id',i.id,'invoice_number',i.invoice_number,'status',i.status) as invoices
       from public.payment_allocations a
       join public.invoices i on i.business_id = a.business_id and i.id = a.invoice_id
       where a.business_id = $1 and a.payment_id = $2 order by a.created_at asc`,
      [businessId, paymentId],
    ),
    "select", "payment_allocations",
  );
}
