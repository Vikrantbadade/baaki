import { AppError } from "../errors/AppError.js";
import { getDraftInvoice } from "../repositories/invoices.repository.js";
import { throwOnSupabaseError } from "../utils/supabaseError.js";

export async function requireInvoiceEditable(req, _res, next) {
  const { data, error } = await getDraftInvoice(
    req.supabase,
    req.business.id,
    req.params.invoiceId,
  );
  throwOnSupabaseError(error);
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
