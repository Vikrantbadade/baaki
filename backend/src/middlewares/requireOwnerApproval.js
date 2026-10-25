import { AppError } from "../errors/AppError.js";
import { getDatabaseErrorContext, withDatabaseContext } from "../utils/databaseResult.js";

export async function requireOwnerApproval(req, _res, next) {
  const { data, error } = await withDatabaseContext(
    req.db.query(
      "select id, status from public.collection_plans where business_id = $1 and id = $2",
      [req.business.id, req.params.planId],
    ),
    "select",
    "collection_plans",
    { single: true },
  );
  if (error) {
    const appError = new AppError(500, "DATABASE_ERROR", "Collection plan could not be loaded");
    appError.cause = error;
    appError.databaseContext = getDatabaseErrorContext(error);
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
