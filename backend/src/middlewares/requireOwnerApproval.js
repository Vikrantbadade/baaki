import { AppError } from "../errors/AppError.js";
import { getSupabaseErrorContext, withSupabaseContext } from "../utils/supabaseError.js";

export async function requireOwnerApproval(req, _res, next) {
  const { data, error } = await withSupabaseContext(
    req.supabase
      .from("collection_plans")
      .select("id,status")
      .eq("business_id", req.business.id)
      .eq("id", req.params.planId)
      .maybeSingle(),
    "select",
    "collection_plans",
  );
  if (error) {
    const appError = new AppError(500, "DATABASE_ERROR", "Collection plan could not be loaded");
    appError.cause = error;
    appError.databaseContext = getSupabaseErrorContext(error);
    next(appError);
    return;
  }
  if (!data) {
    next(new AppError(404, "COLLECTION_PLAN_NOT_FOUND", "Collection plan was not found"));
    return;
  }
  if (data.status !== "approved") {
    next(new AppError(409, "OWNER_APPROVAL_REQUIRED", "Owner approval is required before execution"));
    return;
  }
  req.collectionPlan = data;
  next();
}
