import { AppError } from "../errors/AppError.js";
import { createBusiness, findBusinessForOwner, updateBusiness } from "../repositories/business.repository.js";
import { throwOnDatabaseError } from "../utils/databaseResult.js";

export async function createInitialBusiness(db, ownerUserId, input) {
  const existing = await findBusinessForOwner(db, ownerUserId);
  throwOnDatabaseError(existing.error);
  if (existing.data) {
    throw new AppError(409, "BUSINESS_ALREADY_EXISTS", "This account already has a business");
  }

  const { data, error } = await createBusiness(db, ownerUserId, {
    name: input.name,
    legal_name: input.legalName,
    gstin: input.gstin,
    address: input.address,
    invoice_settings: input.invoiceSettings,
  });
  throwOnDatabaseError(error);
  return data;
}

export async function changeBusiness(db, businessId, input) {
  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.legalName !== undefined ? { legal_name: input.legalName } : {}),
    ...(input.gstin !== undefined ? { gstin: input.gstin } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.invoiceSettings !== undefined ? { invoice_settings: input.invoiceSettings } : {}),
  };
  const { data, error } = await updateBusiness(db, businessId, patch);
  throwOnDatabaseError(error);
  return data;
}
