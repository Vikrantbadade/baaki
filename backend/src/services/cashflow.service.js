import { AppError } from "../errors/AppError.js";
import {
  deleteCashflowEntry,
  getCashflowEntry,
  insertCashSnapshot,
  insertCashflowEntry,
  latestCashflowForecast,
  latestCashSnapshot,
  listCashSnapshots,
  listCashflowEntries,
  saveCashflowForecast,
  updateCashflowEntry,
} from "../repositories/cashflow.repository.js";
import { throwOnDatabaseError } from "../utils/databaseResult.js";

export async function recordCashSnapshot(db, businessId, input) {
  const { data, error } = await insertCashSnapshot(
    db,
    businessId,
    input.amountPaise,
    input.recordedAt ?? new Date().toISOString(),
  );
  throwOnDatabaseError(error);
  return data;
}

export async function getLatestCashSnapshot(db, businessId) {
  const { data, error } = await latestCashSnapshot(db, businessId);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "CASH_SNAPSHOT_NOT_FOUND", "No cash snapshot has been recorded");
  return data;
}

export async function getCashSnapshots(db, businessId, page, limit) {
  const { data, error, count } = await listCashSnapshots(db, businessId, page, limit);
  throwOnDatabaseError(error);
  return { items: data, page, limit, total: count };
}

export async function addCashflowEntry(db, businessId, input) {
  const { data, error } = await insertCashflowEntry(db, businessId, {
    direction: input.direction,
    amount_paise: input.amountPaise,
    due_date: input.dueDate,
    category: input.category,
    description: input.description,
    is_actual: input.isActual,
  });
  throwOnDatabaseError(error);
  return data;
}

export async function getCashflowEntries(db, businessId, query) {
  if (query.from && query.to && query.from > query.to) {
    throw new AppError(400, "INVALID_DATE_RANGE", "The from date must not be after the to date");
  }
  const { data, error, count } = await listCashflowEntries(db, businessId, query);
  throwOnDatabaseError(error);
  return { items: data, page: query.page, limit: query.limit, total: count };
}

export async function getCashflowEntryById(db, businessId, entryId) {
  const { data, error } = await getCashflowEntry(db, businessId, entryId);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "CASHFLOW_ENTRY_NOT_FOUND", "Cash-flow entry was not found");
  return data;
}

export async function changeCashflowEntry(db, businessId, entryId, input) {
  await getCashflowEntryById(db, businessId, entryId);
  const patch = {
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.amountPaise !== undefined ? { amount_paise: input.amountPaise } : {}),
    ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.isActual !== undefined ? { is_actual: input.isActual } : {}),
  };
  const { data, error } = await updateCashflowEntry(db, businessId, entryId, patch);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "CASHFLOW_ENTRY_NOT_FOUND", "Cash-flow entry was not found");
  return data;
}

export async function removeCashflowEntry(db, businessId, entryId) {
  await getCashflowEntryById(db, businessId, entryId);
  const { error } = await deleteCashflowEntry(db, businessId, entryId);
  throwOnDatabaseError(error);
}

export async function createCashflowForecast(db, businessId, input) {
  const snapshot = await getLatestCashSnapshot(db, businessId);
  const startDate = input.startDate ?? new Date().toISOString().slice(0, 10);
  if (startDate < snapshot.recorded_at.slice(0, 10)) {
    throw new AppError(422, "FORECAST_BEFORE_SNAPSHOT", "Forecast cannot start before the cash snapshot");
  }
  const { data, error } = await saveCashflowForecast(db, businessId, startDate, input.horizonDays);
  throwOnDatabaseError(error);
  return data;
}

export async function getLatestForecast(db, businessId) {
  const { data, error } = await latestCashflowForecast(db, businessId);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "FORECAST_NOT_FOUND", "No cash-flow forecast has been saved");
  return data.result;
}

export async function getCashflowRisks(db, businessId) {
  const forecast = await getLatestForecast(db, businessId);
  return {
    shortageDate: forecast.shortageDate,
    cashGapPaise: forecast.cashGapPaise,
    isEstimate: true,
  };
}
