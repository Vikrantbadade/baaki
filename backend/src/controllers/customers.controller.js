import * as customers from "../services/customers.service.js";

function send(res, req, data, status = 200) {
  res.status(status).json({ data, meta: { requestId: req.id } });
}

export async function createCustomer(req, res) {
  send(res, req, await customers.addCustomer(req.supabase, req.business.id, req.validated.body), 201);
}

export async function listCustomers(req, res) {
  send(res, req, await customers.getCustomers(req.supabase, req.business.id, req.validated.query));
}

export async function getCustomer(req, res) {
  send(res, req, await customers.getCustomerById(req.supabase, req.business.id, req.validated.params.customerId));
}

export async function updateCustomer(req, res) {
  send(
    res,
    req,
    await customers.changeCustomer(
      req.supabase,
      req.business.id,
      req.validated.params.customerId,
      req.validated.body,
    ),
  );
}

export async function deleteCustomer(req, res) {
  await customers.archiveCustomerRecord(req.supabase, req.business.id, req.validated.params.customerId);
  res.status(204).end();
}

export async function getCustomerLedger(req, res) {
  send(res, req, await customers.getCustomerLedger(req.supabase, req.business.id, req.validated.params.customerId));
}

export async function getCustomerInvoices(req, res) {
  send(res, req, await customers.getCustomerInvoices(req.supabase, req.business.id, req.validated.params.customerId));
}

export async function getCustomerPayments(req, res) {
  send(res, req, await customers.getCustomerPayments(req.supabase, req.business.id, req.validated.params.customerId));
}
