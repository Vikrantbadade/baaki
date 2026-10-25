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
import { throwOnSupabaseError } from "../utils/supabaseError.js";

export async function recordCashSnapshot(supabase, businessId, input) {
  const { data, error } = await insertCashSnapshot(
    supabase,
    businessId,
    input.amountPaise,
    input.recordedAt ?? new Date().toISOString(),
  );
  throwOnSupabaseError(error);
  return data;
}

export async function getLatestCashSnapshot(supabase, businessId) {
  const { data, error } = await latestCashSnapshot(supabase, businessId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "CASH_SNAPSHOT_NOT_FOUND", "No cash snapshot has been recorded");
  return data;
}

export async function getCashSnapshots(supabase, businessId, page, limit) {
  const { data, error, count } = await listCashSnapshots(supabase, businessId, page, limit);
  throwOnSupabaseError(error);
  return { items: data, page, limit, total: count };
}

export async function addCashflowEntry(supabase, businessId, input) {
  const { data, error } = await insertCashflowEntry(supabase, businessId, {
    direction: input.direction,
    amount_paise: input.amountPaise,
    due_date: input.dueDate,
    category: input.category,
    description: input.description,
    is_actual: input.isActual,
  });
  throwOnSupabaseError(error);
  return data;
}

export async function getCashflowEntries(supabase, businessId, query) {
  if (query.from && query.to && query.from > query.to) {
    throw new AppError(400, "INVALID_DATE_RANGE", "The from date must not be after the to date");
  }
  const { data, error, count } = await listCashflowEntries(supabase, businessId, query);
  throwOnSupabaseError(error);
  return { items: data, page: query.page, limit: query.limit, total: count };
}

export async function getCashflowEntryById(supabase, businessId, entryId) {
  const { data, error } = await getCashflowEntry(supabase, businessId, entryId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "CASHFLOW_ENTRY_NOT_FOUND", "Cash-flow entry was not found");
  return data;
}

export async function changeCashflowEntry(supabase, businessId, entryId, input) {
  await getCashflowEntryById(supabase, businessId, entryId);
  const patch = {
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.amountPaise !== undefined ? { amount_paise: input.amountPaise } : {}),
    ...(input.dueDate !== undefined ? { due_date: input.dueDate } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.isActual !== undefined ? { is_actual: input.isActual } : {}),
  };
  const { data, error } = await updateCashflowEntry(supabase, businessId, entryId, patch);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "CASHFLOW_ENTRY_NOT_FOUND", "Cash-flow entry was not found");
  return data;
}

export async function removeCashflowEntry(supabase, businessId, entryId) {
  await getCashflowEntryById(supabase, businessId, entryId);
  const { error } = await deleteCashflowEntry(supabase, businessId, entryId);
  throwOnSupabaseError(error);
}

export async function createCashflowForecast(supabase, businessId, input) {
  const snapshot = await getLatestCashSnapshot(supabase, businessId);
  const startDate = input.startDate ?? new Date().toISOString().slice(0, 10);
  if (startDate < snapshot.recorded_at.slice(0, 10)) {
    throw new AppError(422, "FORECAST_BEFORE_SNAPSHOT", "Forecast cannot start before the cash snapshot");
  }
  const { data, error } = await saveCashflowForecast(supabase, businessId, startDate, input.horizonDays);
  throwOnSupabaseError(error);
  return data;
}

export async function getLatestForecast(supabase, businessId) {
  const { data, error } = await latestCashflowForecast(supabase, businessId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "FORECAST_NOT_FOUND", "No cash-flow forecast has been saved");
  return data.result;
}

export async function getCashflowRisks(supabase, businessId) {
  const forecast = await getLatestForecast(supabase, businessId);
  return {
    shortageDate: forecast.shortageDate,
    cashGapPaise: forecast.cashGapPaise,
    isEstimate: true,
  };
}
