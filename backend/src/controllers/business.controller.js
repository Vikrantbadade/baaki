import { createInitialBusiness, changeBusiness } from "../services/business.service.js";
import { findBusinessForOwner } from "../repositories/business.repository.js";
import { throwOnDatabaseError } from "../utils/databaseResult.js";
import { AppError } from "../errors/AppError.js";

export async function createBusiness(req, res) {
  const data = await createInitialBusiness(req.db, req.user.id, req.validated.body);
  res.status(201).json({ data, meta: { requestId: req.id } });
}

export async function getCurrentBusiness(req, res) {
  const { data, error } = await findBusinessForOwner(req.db, req.user.id);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "BUSINESS_NOT_FOUND", "No business is configured for this account");
  res.json({ data, meta: { requestId: req.id } });
}

export async function updateCurrentBusiness(req, res) {
  const data = await changeBusiness(req.db, req.business.id, req.validated.body);
  res.json({ data, meta: { requestId: req.id } });
}
