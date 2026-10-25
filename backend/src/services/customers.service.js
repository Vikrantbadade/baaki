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
import { throwOnDatabaseError } from "../utils/databaseResult.js";
import { sumPaise } from "../utils/money.js";

export async function addCustomer(db, businessId, input) {
  const row = {
    name: input.name,
    email: input.email,
    phone: input.phone,
    address: input.address,
    tax_id: input.taxId,
    notes: input.notes,
  };
  const { data, error } = await createCustomer(db, businessId, row);
  throwOnDatabaseError(error);
  return data;
}

export async function getCustomers(db, businessId, query) {
  const { data, error, count } = await listCustomers(db, businessId, query);
  throwOnDatabaseError(error);
  return { items: data, page: query.page, limit: query.limit, total: count };
}

export async function getCustomerById(db, businessId, customerId) {
  const { data, error } = await getCustomer(db, businessId, customerId);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
  return data;
}

export async function changeCustomer(db, businessId, customerId, input) {
  await getCustomerById(db, businessId, customerId);
  const patch = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.address !== undefined ? { address: input.address } : {}),
    ...(input.taxId !== undefined ? { tax_id: input.taxId } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
  const { data, error } = await updateCustomer(db, businessId, customerId, patch);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
  return data;
}

export async function archiveCustomerRecord(db, businessId, customerId) {
  await getCustomerById(db, businessId, customerId);
  const { data, error } = await archiveCustomer(db, businessId, customerId);
  throwOnDatabaseError(error);
  if (!data) throw new AppError(404, "CUSTOMER_NOT_FOUND", "Customer was not found");
}

export async function getCustomerLedger(db, businessId, customerId) {
  await getCustomerById(db, businessId, customerId);
  const [invoiceResult, paymentResult] = await Promise.all([
    customerInvoices(db, businessId, customerId),
    customerPayments(db, businessId, customerId),
  ]);
  throwOnDatabaseError(invoiceResult.error);
  throwOnDatabaseError(paymentResult.error);
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

export async function getCustomerInvoices(db, businessId, customerId) {
  await getCustomerById(db, businessId, customerId);
  const { data, error } = await customerInvoices(db, businessId, customerId);
  throwOnDatabaseError(error);
  return data;
}

export async function getCustomerPayments(db, businessId, customerId) {
  await getCustomerById(db, businessId, customerId);
  const { data, error } = await customerPayments(db, businessId, customerId);
  throwOnDatabaseError(error);
  return data;
}
