import { withSupabaseContext } from "../utils/supabaseError.js";

export function listPayments(supabase, businessId, { page, limit }) {
  return withSupabaseContext(
    supabase
      .from("payments")
      .select("id,customer_id,amount_paise,currency,method,source,status,received_at,created_at", {
        count: "exact",
      })
      .eq("business_id", businessId)
      .order("received_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1),
    "select",
    "payments",
  );
}

export function getPayment(supabase, businessId, paymentId) {
  return withSupabaseContext(
    supabase
      .from("payments")
      .select("*,payment_allocations(*)")
      .eq("business_id", businessId)
      .eq("id", paymentId)
      .maybeSingle(),
    "select",
    "payments",
  );
}

export function recordManualPayment(supabase, parameters) {
  return withSupabaseContext(supabase.rpc("record_manual_payment", parameters), "rpc:record_manual_payment", "payments");
}

export function allocatePayment(supabase, parameters) {
  return withSupabaseContext(supabase.rpc("allocate_payment", parameters), "rpc:allocate_payment", "payment_allocations");
}

export function listPaymentAllocations(supabase, businessId, paymentId) {
  return withSupabaseContext(
    supabase
      .from("payment_allocations")
      .select("*,invoices(id,invoice_number,status)")
      .eq("business_id", businessId)
      .eq("payment_id", paymentId)
      .order("created_at", { ascending: true }),
    "select",
    "payment_allocations",
  );
}
