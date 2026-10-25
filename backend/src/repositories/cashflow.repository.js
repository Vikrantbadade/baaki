import { withSupabaseContext } from "../utils/supabaseError.js";

export function insertCashSnapshot(supabase, businessId, amountPaise, recordedAt) {
  return withSupabaseContext(
    supabase
      .from("cash_snapshots")
      .insert({ business_id: businessId, amount_paise: amountPaise, recorded_at: recordedAt })
      .select("*")
      .single(),
    "insert",
    "cash_snapshots",
  );
}

export function latestCashSnapshot(supabase, businessId) {
  return withSupabaseContext(
    supabase
      .from("cash_snapshots")
      .select("*")
      .eq("business_id", businessId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "select",
    "cash_snapshots",
  );
}

export function listCashSnapshots(supabase, businessId, page, limit) {
  return withSupabaseContext(
    supabase
      .from("cash_snapshots")
      .select("*", { count: "exact" })
      .eq("business_id", businessId)
      .order("recorded_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1),
    "select",
    "cash_snapshots",
  );
}

export function insertCashflowEntry(supabase, businessId, entry) {
  return withSupabaseContext(
    supabase.from("cashflow_entries").insert({ ...entry, business_id: businessId }).select("*").single(),
    "insert",
    "cashflow_entries",
  );
}

export function listCashflowEntries(supabase, businessId, { from, to, page, limit }) {
  let query = supabase
    .from("cashflow_entries")
    .select("*", { count: "exact" })
    .eq("business_id", businessId)
    .order("due_date", { ascending: true })
    .range((page - 1) * limit, page * limit - 1);
  if (from) query = query.gte("due_date", from);
  if (to) query = query.lte("due_date", to);
  return withSupabaseContext(query, "select", "cashflow_entries");
}

export function getCashflowEntry(supabase, businessId, entryId) {
  return withSupabaseContext(
    supabase
      .from("cashflow_entries")
      .select("*")
      .eq("business_id", businessId)
      .eq("id", entryId)
      .maybeSingle(),
    "select",
    "cashflow_entries",
  );
}

export function updateCashflowEntry(supabase, businessId, entryId, patch) {
  return withSupabaseContext(
    supabase
      .from("cashflow_entries")
      .update(patch)
      .eq("business_id", businessId)
      .eq("id", entryId)
      .select("*")
      .maybeSingle(),
    "update",
    "cashflow_entries",
  );
}

export function deleteCashflowEntry(supabase, businessId, entryId) {
  return withSupabaseContext(
    supabase.from("cashflow_entries").delete().eq("business_id", businessId).eq("id", entryId),
    "delete",
    "cashflow_entries",
  );
}

export function saveCashflowForecast(supabase, businessId, startDate, horizonDays) {
  return withSupabaseContext(
    supabase.rpc("create_cashflow_forecast", {
      p_business_id: businessId,
      p_start_date: startDate,
      p_horizon_days: horizonDays,
    }),
    "rpc:create_cashflow_forecast",
    "cashflow_forecasts",
  );
}

export function latestCashflowForecast(supabase, businessId) {
  return withSupabaseContext(
    supabase
      .from("cashflow_forecasts")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "select",
    "cashflow_forecasts",
  );
}
