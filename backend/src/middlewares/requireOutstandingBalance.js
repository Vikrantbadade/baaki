import { AppError } from "../errors/AppError.js";
import { getInvoiceById } from "../services/invoices.service.js";

export async function requireOutstandingBalance(req, _res, next) {
  const invoiceId = req.params.invoiceId ?? req.body?.invoiceId;
  if (!invoiceId) {
    next(new AppError(400, "INVOICE_REQUIRED", "An invoice ID is required"));
    return;
  }
  const invoice = await getInvoiceById(req.db, req.business.id, invoiceId);
  if (invoice.outstanding_paise <= 0) {
    next(new AppError(409, "NO_OUTSTANDING_BALANCE", "The invoice has no outstanding balance"));
    return;
  }
  req.invoice = invoice;
  next();
}
