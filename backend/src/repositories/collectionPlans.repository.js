import { withSupabaseContext } from "../utils/supabaseError.js";

export function getInvoicesForPlanning(supabase, businessId, customerIds = null) {
  let query = supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      customer_id,
      status,
      due_date,
      issue_date,
      total_paise,
      paid_amount_paise,
      outstanding_paise,
      notes,
      customers!inner (
        id,
        name,
        archived_at
      )
    `)
    .eq("business_id", businessId)
    .in("status", ["issued", "partially_paid"])
    .gt("outstanding_paise", 0);

  if (customerIds && customerIds.length > 0) {
    query = query.in("customer_id", customerIds);
  }

  return withSupabaseContext(query, "select", "invoices");
}

export function insertCollectionPlan(supabase, businessId, { targetPaise, deadlineDate, recommendation, modelVersion = "baaki-planner-v1.0" }) {
  return withSupabaseContext(
    supabase
      .from("collection_plans")
      .insert({
        business_id: businessId,
        target_paise: targetPaise,
        deadline: deadlineDate,
        model_version: modelVersion,
        recommendation,
        status: "proposed",
      })
      .select("*")
      .single(),
    "insert",
    "collection_plans",
  );
}

export function insertCollectionPlanItems(supabase, businessId, planId, items) {
  const records = items.map((item) => ({
    business_id: businessId,
    plan_id: planId,
    customer_id: item.customerId,
    invoice_id: item.invoiceId,
    recommended_amount_paise: item.recommendedAmountPaise,
    probability: item.probability ?? 0.75,
    is_demo_prediction: item.isDemoPrediction ?? true,
  }));

  return withSupabaseContext(
    supabase.from("collection_plan_items").insert(records).select("*"),
    "insert",
    "collection_plan_items",
  );
}

export function listCollectionPlans(supabase, businessId, { page = 1, limit = 25, status }) {
  let query = supabase
    .from("collection_plans")
    .select("*", { count: "exact" })
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  return withSupabaseContext(query, "select", "collection_plans");
}

export function getCollectionPlan(supabase, businessId, planId) {
  return withSupabaseContext(
    supabase
      .from("collection_plans")
      .select(`
        *,
        collection_plan_items (
          id,
          customer_id,
          invoice_id,
          recommended_amount_paise,
          probability,
          is_demo_prediction,
          created_at,
          customers (
            id,
            name,
            email,
            phone
          ),
          invoices (
            id,
            invoice_number,
            status,
            total_paise,
            outstanding_paise,
            due_date
          )
        )
      `)
      .eq("business_id", businessId)
      .eq("id", planId)
      .maybeSingle(),
    "select",
    "collection_plans",
  );
}

export function updateCollectionPlan(supabase, businessId, planId, fields) {
  return withSupabaseContext(
    supabase
      .from("collection_plans")
      .update(fields)
      .eq("business_id", businessId)
      .eq("id", planId)
      .select("*")
      .single(),
    "update",
    "collection_plans",
  );
}

export function insertPlanReminders(supabase, businessId, planId, items) {
  const reminders = items.map((item) => ({
    business_id: businessId,
    collection_plan_id: planId,
    invoice_id: item.invoiceId || item.invoice_id,
    channel: "whatsapp",
    status: "pending",
    scheduled_at: new Date().toISOString(),
    delivery_result: {},
  }));

  return withSupabaseContext(
    supabase.from("reminders").insert(reminders).select("*"),
    "insert",
    "reminders",
  );
}
