import * as payments from "../services/payments.service.js";

function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: { requestId: req.id } });
}

export async function createPayment(req, res) {
  send(res, req, await payments.recordOfflinePayment(req, req.validated.body), 201);
}

export async function listPayments(req, res) {
  send(res, req, await payments.getPayments(req.supabase, req.business.id, req.validated.query));
}

export async function getPayment(req, res) {
  send(res, req, await payments.getPaymentById(req.supabase, req.business.id, req.validated.params.paymentId));
}

export async function createAllocations(req, res) {
  send(
    res,
    req,
    await payments.addPaymentAllocations(
      req,
      req.validated.params.paymentId,
      req.validated.body.allocations,
    ),
    201,
  );
}

export async function listAllocations(req, res) {
  send(
    res,
    req,
    await payments.getAllocations(req.supabase, req.business.id, req.validated.params.paymentId),
  );
}
