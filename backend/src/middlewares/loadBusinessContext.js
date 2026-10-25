import { AppError } from "../errors/AppError.js";
import { findBusinessForOwner } from "../repositories/business.repository.js";
import { throwOnDatabaseError } from "../utils/databaseResult.js";

export async function loadBusinessContext(req, _res, next) {
  const { data, error } = await findBusinessForOwner(req.db, req.user.id);
  throwOnDatabaseError(error);
  if (!data) {
    next(new AppError(404, "BUSINESS_NOT_FOUND", "Create a business before using this resource"));
    return;
  }

  req.business = data;
  next();
}
