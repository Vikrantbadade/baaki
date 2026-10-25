import { withSupabaseContext } from "../utils/supabaseError.js";

export function findBusinessForOwner(supabase, ownerUserId) {
  return withSupabaseContext(
    supabase.from("businesses").select("*").eq("owner_user_id", ownerUserId).maybeSingle(),
    "select",
    "businesses",
  );
}

export function createBusiness(supabase, ownerUserId, business) {
  return withSupabaseContext(
    supabase
      .from("businesses")
      .insert({ ...business, owner_user_id: ownerUserId })
      .select("*")
      .single(),
    "insert",
    "businesses",
  );
}

export function updateBusiness(supabase, businessId, patch) {
  return withSupabaseContext(
    supabase.from("businesses").update(patch).eq("id", businessId).select("*").single(),
    "update",
    "businesses",
  );
}
