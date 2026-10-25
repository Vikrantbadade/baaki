import { withDatabaseContext } from "../utils/databaseResult.js";

export function insertCashSnapshot(db, businessId, amountPaise, recordedAt) {
  return withDatabaseContext(
    db.query(
      "insert into public.cash_snapshots (business_id,amount_paise,recorded_at) values ($1,$2,$3) returning *",
      [businessId, amountPaise, recordedAt],
    ),
    "insert", "cash_snapshots", { single: true },
  );
}

export function latestCashSnapshot(db, businessId) {
  return withDatabaseContext(
    db.query(
      "select * from public.cash_snapshots where business_id = $1 order by recorded_at desc limit 1",
      [businessId],
    ),
    "select", "cash_snapshots", { single: true },
  );
}

export function listCashSnapshots(db, businessId, page, limit) {
  return withDatabaseContext(
    db.query(
      `select *, count(*) over()::integer as total_count from public.cash_snapshots
       where business_id = $1 order by recorded_at desc limit $2 offset $3`,
      [businessId, limit, (page - 1) * limit],
    ),
    "select", "cash_snapshots",
  ).then(({ data, error }) => ({
    data: data?.map(({ total_count: _total, ...row }) => row) ?? data,
    error,
    count: data?.[0]?.total_count ?? 0,
  }));
}

export function insertCashflowEntry(db, businessId, entry) {
  return withDatabaseContext(
    db.query(
      `insert into public.cashflow_entries (business_id,direction,amount_paise,due_date,category,description,is_actual)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [businessId, entry.direction, entry.amount_paise, entry.due_date, entry.category, entry.description, entry.is_actual],
    ),
    "insert", "cashflow_entries", { single: true },
  );
}

export function listCashflowEntries(db, businessId, { from, to, page, limit }) {
  const values = [businessId];
  const predicates = ["business_id = $1"];
  if (from) { values.push(from); predicates.push(`due_date >= $${values.length}`); }
  if (to) { values.push(to); predicates.push(`due_date <= $${values.length}`); }
  values.push(limit, (page - 1) * limit);
  return withDatabaseContext(
    db.query(
      `select *, count(*) over()::integer as total_count from public.cashflow_entries
       where ${predicates.join(" and ")} order by due_date asc limit $${values.length - 1} offset $${values.length}`,
      values,
    ),
    "select", "cashflow_entries",
  ).then(({ data, error }) => ({
    data: data?.map(({ total_count: _total, ...row }) => row) ?? data,
    error,
    count: data?.[0]?.total_count ?? 0,
  }));
}

export function getCashflowEntry(db, businessId, entryId) {
  return withDatabaseContext(
    db.query("select * from public.cashflow_entries where business_id = $1 and id = $2", [businessId, entryId]),
    "select", "cashflow_entries", { single: true },
  );
}

export function updateCashflowEntry(db, businessId, entryId, patch) {
  const allowed = {
    direction: "direction", amount_paise: "amount_paise", due_date: "due_date",
    category: "category", description: "description", is_actual: "is_actual",
  };
  const keys = Object.keys(patch).filter((key) => allowed[key]);
  const values = keys.map((key) => patch[key]);
  const assignments = keys.map((key, index) => `${allowed[key]} = $${index + 1}`);
  values.push(businessId, entryId);
  return withDatabaseContext(
    db.query(
      `update public.cashflow_entries set ${assignments.join(", ")}
       where business_id = $${values.length - 1} and id = $${values.length} returning *`,
      values,
    ),
    "update", "cashflow_entries", { single: true },
  );
}

export function deleteCashflowEntry(db, businessId, entryId) {
  return withDatabaseContext(
    db.query("delete from public.cashflow_entries where business_id = $1 and id = $2", [businessId, entryId]),
    "delete", "cashflow_entries",
  );
}

export function saveCashflowForecast(db, businessId, startDate, horizonDays) {
  return withDatabaseContext(
    db.query(
      "select public.create_cashflow_forecast($1,$2,$3) as result",
      [businessId, startDate, horizonDays],
    ).then(({ rows, ...result }) => ({ ...result, rows: rows.map((row) => row.result) })),
    "rpc:create_cashflow_forecast", "cashflow_forecasts", { single: true },
  );
}

export function latestCashflowForecast(db, businessId) {
  return withDatabaseContext(
    db.query(
      "select * from public.cashflow_forecasts where business_id = $1 order by created_at desc limit 1",
      [businessId],
    ),
    "select", "cashflow_forecasts", { single: true },
  );
}
