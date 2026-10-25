import { AppError } from "../errors/AppError.js";
import {
  archiveCustomer,
  createCustomer,
  customerInvoices,
  customerPayments,
  getCustomer,
  listCustomers,
  updateCustomer,
} from "../repositories/customers.repository.js";
import { throwOnSupabaseError } from "../utils/supabaseError.js";
import { sumPaise } from "../utils/money.js";

export async function addCustomer(supabase, businessId, input) {
  const row = {
    name: input.name,
    email: input.email,
    phone: input.phone,
    address: input.address,
    tax_id: input.taxId,
    notes: input.notes,
  };
  const { data, error } = await createCustomer(supabase, businessId, row);
  throwOnSupabaseError(error);
  return data;
}

export async function getCustomers(supabase, businessId, query) {
  const { data, error, count } = await listCustomers(supabase, businessId, query);
  throwOnSupabaseError(error);
  return { items: data, page: query.page, limit: query.limit, total: count };
}

export async function getCustomerById(supabase, businessId, customerId) {
  const { data, error } = await getCustomer(supabase, businessId, customerId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
  return data;
}

export async function changeCustomer(supabase, businessId, customerId, input) {
  await getCustomerById(supabase, businessId, customerId);
  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.taxId !== undefined ? { tax_id: input.taxId } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
  const { data, error } = await updateCustomer(supabase, businessId, customerId, patch);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
  return data;
}

export async function archiveCustomerRecord(supabase, businessId, customerId) {
  await getCustomerById(supabase, businessId, customerId);
  const { data, error } = await archiveCustomer(supabase, businessId, customerId);
  throwOnSupabaseError(error);
  if (!data) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
}

export async function getCustomerLedger(supabase, businessId, customerId) {
  await getCustomerById(supabase, businessId, customerId);
  const [invoiceResult, paymentResult] = await Promise.all([
    customerInvoices(supabase, businessId, customerId),
    customerPayments(supabase, businessId, customerId),
  ]);
  throwOnSupabaseError(invoiceResult.error);
  throwOnSupabaseError(paymentResult.error);
  return {
    invoices: invoiceResult.data,
    payments: paymentResult.data,
    outstandingPaise: sumPaise(
      invoiceResult.data
        .filter((invoice) => !["draft", "cancelled"].includes(invoice.status))
        .map((invoice) => invoice.outstanding_paise),
      "Customer balance",
    ),
    paymentTotalPaise: sumPaise(
      paymentResult.data
        .filter((payment) => payment.status === "confirmed")
        .map((payment) => payment.amount_paise),
      "Customer payment total",
    ),
    currency: "INR",
  };
}

export async function getCustomerInvoices(supabase, businessId, customerId) {
  await getCustomerById(supabase, businessId, customerId);
  const { data, error } = await customerInvoices(supabase, businessId, customerId);
  throwOnSupabaseError(error);
  return data;
}

export async function getCustomerPayments(supabase, businessId, customerId) {
  await getCustomerById(supabase, businessId, customerId);
  const { data, error } = await customerPayments(supabase, businessId, customerId);
  throwOnSupabaseError(error);
  return data;
}
