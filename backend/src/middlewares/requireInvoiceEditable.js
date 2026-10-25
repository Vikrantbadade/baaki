import { AppError } from "../errors/AppError.js";
import { getDraftInvoice } from "../repositories/invoices.repository.js";
import { throwOnDatabaseError } from "../utils/databaseResult.js";

export async function requireInvoiceEditable(req, _res, next) {
  const { data, error } = await getDraftInvoice(
    req.db,
    req.business.id,
    req.params.invoiceId,
  );
  throwOnDatabaseError(error);
  if (!data) {
    next(new AppError(404, "INVOICE_NOT_FOUND", "Invoice was not found"));
    return;
  }
  if (data.status !== "draft") {
    next(new AppError(409, "INVOICE_NOT_EDITABLE", "Only draft invoices can be edited"));
    return;
  }
  next();
}
