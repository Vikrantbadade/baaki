import { createHash } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import {
  allocatePayment,
  getPayment,
  listPaymentAllocations,
  listPayments,
  recordManualPayment,
} from "../repositories/payments.repository.js";
import { throwOnDatabaseError } from "../utils/databaseResult.js";
import { getCustomerById } from "./customers.service.js";

function requestHash(body) {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function requireIdempotencyKey(req) {
  const key = req.idempotencyKey;
  if (!key) {
    throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key of 8 to 128 characters");
  }
  return key;
}

export async function recordOfflinePayment(req, input) {
  await getCustomerById(req.db, req.business.id, input.customerId);
  const { data, error } = await recordManualPayment(req.db, {
    p_business_id: req.business.id,
    p_customer_id: input.customerId,
    p_amount_paise: input.amountPaise,
    p_method: input.method,
    p_received_at: input.receivedAt ?? new Date().toISOString(),
    p_reference: input.reference ?? null,
    p_allocations: input.allocations.map((item) => ({
      invoice_id: item.invoiceId,
      amount_paise: item.amountPaise,
    })),
    p_idempotency_key: requireIdempotencyKey(req),
    p_request_hash: requestHash(input),
  });
  throwOnDatabaseError(error);
  return getPaymentById(req.db, req.business.id, data);
}

export async function getPayments(db, businessId, query) {
  const { data, error, count } = await listPayments(db, businessId, query);
  throwOnDatabaseError(error);
  return { items: data, page: query.page, limit: query.limit, total: count };
}

export async function getPaymentById(db, businessId, paymentId) {
  const { data, error } = await getPayment(db, businessId, paymentId);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment was not found");
  return data;
}

export async function addPaymentAllocations(req, paymentId, allocations) {
  const payment = await getPaymentById(req.db, req.business.id, paymentId);
  if (payment.status !== "confirmed") {
    throw new AppError(409, "PAYMENT_NOT_ALLOCATABLE", "Only confirmed payments can be allocated");
  }
  const key = requireIdempotencyKey(req);
  const { data, error } = await allocatePayment(req.db, {
    p_business_id: req.business.id,
    p_payment_id: paymentId,
    p_allocations: allocations.map((item) => ({
      invoice_id: item.invoiceId,
      amount_paise: item.amountPaise,
    })),
    p_idempotency_key: key,
    p_request_hash: requestHash({ paymentId, allocations }),
  });
  throwOnDatabaseError(error);
  return data;
}

export async function getAllocations(db, businessId, paymentId) {
  await getPaymentById(db, businessId, paymentId);
  const { data, error } = await listPaymentAllocations(db, businessId, paymentId);
  throwOnDatabaseError(error);
  return data;
}
