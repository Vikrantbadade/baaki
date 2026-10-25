import * as cashflow from "../services/cashflow.service.js";

function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: { requestId: req.id } });
}

export async function createSnapshot(req, res) {
  send(
    res,
    req,
    await cashflow.recordCashSnapshot(req.supabase, req.business.id, req.validated.body),
    201,
  );
}

export async function getLatestSnapshot(req, res) {
  send(res, req, await cashflow.getLatestCashSnapshot(req.supabase, req.business.id));
}

export async function listSnapshots(req, res) {
  send(
    res,
    req,
    await cashflow.getCashSnapshots(
      req.supabase,
      req.business.id,
      req.validated.query.page,
      req.validated.query.limit,
    ),
  );
}

export async function createEntry(req, res) {
  send(res, req, await cashflow.addCashflowEntry(req.supabase, req.business.id, req.validated.body), 201);
}

export async function listEntries(req, res) {
  send(
    res,
    req,
    await cashflow.getCashflowEntries(
      req.supabase,
      req.business.id,
      req.validated.query,
    ),
  );
}

export async function getEntry(req, res) {
  send(
    res,
    req,
    await cashflow.getCashflowEntryById(
      req.supabase,
      req.business.id,
      req.validated.params.entryId,
    ),
  );
}

export async function updateEntry(req, res) {
  send(
    res,
    req,
    await cashflow.changeCashflowEntry(
      req.supabase,
      req.business.id,
      req.validated.params.entryId,
      req.validated.body,
    ),
  );
}

export async function deleteEntry(req, res) {
  await cashflow.removeCashflowEntry(req.supabase, req.business.id, req.validated.params.entryId);
  res.status(204).end();
}

export async function createForecast(req, res) {
  send(
    res,
    req,
    await cashflow.createCashflowForecast(req.supabase, req.business.id, req.validated.body),
    201,
  );
}

export async function getForecast(req, res) {
  send(res, req, await cashflow.getLatestForecast(req.supabase, req.business.id));
}

export async function getRisks(req, res) {
  send(res, req, await cashflow.getCashflowRisks(req.supabase, req.business.id));
}
