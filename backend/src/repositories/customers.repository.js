import { withSupabaseContext } from "../utils/supabaseError.js";

export function createCustomer(supabase, businessId, customer) {
  return withSupabaseContext(
    supabase
      .from("customers")
      .insert({ ...customer, business_id: businessId })
      .select("*")
      .single(),
    "insert",
    "customers",
  );
}

export function listCustomers(supabase, businessId, { page, limit, search }) {
  let query = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .eq("business_id", businessId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (search) query = query.ilike("name", `%${search}%`);
  return withSupabaseContext(query, "select", "customers");
}

export function getCustomer(supabase, businessId, customerId) {
  return withSupabaseContext(
    supabase
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .eq("id", customerId)
      .is("archived_at", null)
      .maybeSingle(),
    "select",
    "customers",
  );
}

export function updateCustomer(supabase, businessId, customerId, patch) {
  return withSupabaseContext(
    supabase
      .from("customers")
      .update(patch)
      .eq("business_id", businessId)
      .eq("id", customerId)
      .is("archived_at", null)
      .select("*")
      .maybeSingle(),
    "update",
    "customers",
  );
}

export function archiveCustomer(supabase, businessId, customerId) {
  return withSupabaseContext(
    supabase
      .from("customers")
      .update({ archived_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("id", customerId)
      .is("archived_at", null)
      .select("id")
      .maybeSingle(),
    "update",
    "customers",
  );
}

export function customerInvoices(supabase, businessId, customerId) {
  return withSupabaseContext(
    supabase
      .from("invoices")
      .select("id,invoice_number,status,issue_date,due_date,total_paise,paid_amount_paise,outstanding_paise,currency")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false }),
    "select",
    "invoices",
  );
}

export function customerPayments(supabase, businessId, customerId) {
  return withSupabaseContext(
    supabase
      .from("payments")
      .select("id,amount_paise,currency,method,source,status,received_at,created_at")
      .eq("business_id", businessId)
      .eq("customer_id", customerId)
      .order("received_at", { ascending: false }),
    "select",
    "payments",
  );
}

export function customerInvoicesById(supabase, businessId, customerId) {
  return withSupabaseContext(
    supabase
      .from("invoices")
      .select("id,invoice_number,status,issue_date,due_date,total_paise,paid_amount_paise,outstanding_paise,currency")
      .eq("business_id", businessId)
      .eq("customer_id", customerId),
    "select",
    "invoices",
  );
}
