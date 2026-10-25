import { withDatabaseContext } from "../utils/databaseResult.js";

export function createCustomer(db, businessId, customer) {
  return withDatabaseContext(
    db.query(
      `insert into public.customers (business_id, name, email, phone, tax_id, address, notes)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [businessId, customer.name, customer.email ?? null, customer.phone ?? null, customer.tax_id ?? null,
        JSON.stringify(customer.address ?? {}), customer.notes ?? null],
    ),
    "insert", "customers", { single: true },
  );
}

export function listCustomers(db, businessId, { page, limit, search }) {
  const values = [businessId];
  let predicate = "business_id = $1 and archived_at is null";
  if (search) {
    values.push(`%${search}%`);
    predicate += ` and name ilike $${values.length}`;
  }
  values.push(limit, (page - 1) * limit);
  return withDatabaseContext(
    db.query(
      `select *, count(*) over()::integer as total_count from public.customers
       where ${predicate} order by created_at desc limit $${values.length - 1} offset $${values.length}`,
      values,
    ),
    "select", "customers",
  ).then(({ data, error }) => ({
    data: data?.map(({ total_count: _total, ...customer }) => customer) ?? data,
    error,
    count: data?.[0]?.total_count ?? 0,
  }));
}

export function getCustomer(db, businessId, customerId) {
  return withDatabaseContext(
    db.query(
      "select * from public.customers where business_id = $1 and id = $2 and archived_at is null",
      [businessId, customerId],
    ),
    "select", "customers", { single: true },
  );
}

export function updateCustomer(db, businessId, customerId, patch) {
  const fields = { name: "name", email: "email", phone: "phone", tax_id: "tax_id", address: "address", notes: "notes" };
  const keys = Object.keys(patch).filter((key) => fields[key]);
  const values = keys.map((key) => key === "address" ? JSON.stringify(patch[key]) : patch[key]);
  const assignments = keys.map((key, index) => `${fields[key]} = $${index + 1}${key === "address" ? "::jsonb" : ""}`);
  values.push(businessId, customerId);
  return withDatabaseContext(
    db.query(
      `update public.customers set ${assignments.join(", ")}
       where business_id = $${values.length - 1} and id = $${values.length} and archived_at is null
       returning *`,
      values,
    ),
    "update", "customers", { single: true },
  );
}

export function archiveCustomer(db, businessId, customerId) {
  return withDatabaseContext(
    db.query(
      `update public.customers set archived_at = now()
       where business_id = $1 and id = $2 and archived_at is null returning id`,
      [businessId, customerId],
    ),
    "update", "customers", { single: true },
  );
}

export function customerInvoices(db, businessId, customerId) {
  return withDatabaseContext(
    db.query(
      `select id,invoice_number,status,issue_date,due_date,total_paise,paid_amount_paise,outstanding_paise,currency
       from public.invoices where business_id = $1 and customer_id = $2 order by created_at desc`,
      [businessId, customerId],
    ),
    "select", "invoices",
  );
}

export function customerPayments(db, businessId, customerId) {
  return withDatabaseContext(
    db.query(
      `select id,amount_paise,currency,method,source,status,received_at,created_at
       from public.payments where business_id = $1 and customer_id = $2 order by received_at desc`,
      [businessId, customerId],
    ),
    "select", "payments",
  );
}

export function customerInvoicesById(db, businessId, customerId) {
  return customerInvoices(db, businessId, customerId);
}
