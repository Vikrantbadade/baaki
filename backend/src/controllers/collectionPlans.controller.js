import * as collectionPlanner from "../services/collectionPlanner.service.js";
import * as voiceInterpretation from "../services/voiceInterpretation.service.js";

function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: { requestId: req.id } });
}

export async function interpretVoice(req, res) {
  const result = await voiceInterpretation.interpretVoiceInput(req.validated.body);
  send(res, req, result, 200);
}

export async function previewPlan(req, res) {
  const result = await collectionPlanner.previewCollectionPlan(
    req.supabase,
    req.business.id,
    req.validated.body,
  );
  send(res, req, result, 200);
}

export async function createPlan(req, res) {
  const result = await collectionPlanner.saveCollectionPlan(
    req.supabase,
    req.business.id,
    req.validated.body,
  );
  send(res, req, result, 201);
}

export async function listPlans(req, res) {
  const result = await collectionPlanner.getCollectionPlans(
    req.supabase,
    req.business.id,
    req.validated.query,
  );
  send(res, req, result, 200);
}

export async function getPlan(req, res) {
  const result = await collectionPlanner.getCollectionPlanById(
    req.supabase,
    req.business.id,
    req.validated.params.planId,
  );
  send(res, req, result, 200);
}

export async function approvePlan(req, res) {
  const result = await collectionPlanner.approveCollectionPlan(
    req.supabase,
    req.business.id,
    req.validated.params.planId,
  );
  send(res, req, result, 200);
}

export async function rejectPlan(req, res) {
  const result = await collectionPlanner.rejectCollectionPlan(
    req.supabase,
    req.business.id,
    req.validated.params.planId,
    req.validated.body?.reason,
  );
  send(res, req, result, 200);
}

export async function cancelPlan(req, res) {
  const result = await collectionPlanner.cancelCollectionPlan(
    req.supabase,
    req.business.id,
    req.validated.params.planId,
  );
  send(res, req, result, 200);
}

export async function executePlan(req, res) {
  const result = await collectionPlanner.executeCollectionPlan(
    req.supabase,
    req.business.id,
    req.validated.params.planId,
  );
  send(res, req, result, 200);
}
