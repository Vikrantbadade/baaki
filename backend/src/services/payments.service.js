import { createHash } from "node:crypto";
import { AppError } from "../errors/AppError.js";
import {
  allocatePayment,
  getPayment,
  listPaymentAllocations,
  listPayments,
  recordManualPayment,
} from "../repositories/payments.repository.js";
import { throwOnSupabaseError } from "../utils/supabaseError.js";
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
  await getCustomerById(req.supabase, req.business.id, input.customerId);
  const { data, error } = await recordManualPayment(req.supabase, {
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
  throwOnSupabaseError(error);
  return getPaymentById(req.supabase, req.business.id, data);
}

export async function getPayments(supabase, businessId, query) {
  const { data, error, count } = await listPayments(supabase, businessId, query);
  throwOnSupabaseError(error);
  return { items: data, page: query.page, limit: query.limit, total: count };
}

export async function getPaymentById(supabase, businessId, paymentId) {
  const { data, error } = await getPayment(supabase, businessId, paymentId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "PAYMENT_NOT_FOUND", "Payment was not found");
  return data;
}

export async function addPaymentAllocations(req, paymentId, allocations) {
  const payment = await getPaymentById(req.supabase, req.business.id, paymentId);
  if (payment.status !== "confirmed") {
    throw new AppError(409, "PAYMENT_NOT_ALLOCATABLE", "Only confirmed payments can be allocated");
  }
  const key = requireIdempotencyKey(req);
  const { data, error } = await allocatePayment(req.supabase, {
    p_business_id: req.business.id,
    p_payment_id: paymentId,
    p_allocations: allocations.map((item) => ({
      invoice_id: item.invoiceId,
      amount_paise: item.amountPaise,
    })),
    p_idempotency_key: key,
    p_request_hash: requestHash({ paymentId, allocations }),
  });
  throwOnSupabaseError(error);
  return data;
}

export async function getAllocations(supabase, businessId, paymentId) {
  await getPaymentById(supabase, businessId, paymentId);
  const { data, error } = await listPaymentAllocations(supabase, businessId, paymentId);
  throwOnSupabaseError(error);
  return data;
}
