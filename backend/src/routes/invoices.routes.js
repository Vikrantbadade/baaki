import { Router } from "express";
import { authenticateUser } from "../middlewares/authenticateUser.js";
import { loadBusinessContext } from "../middlewares/loadBusinessContext.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { idempotencyMiddleware } from "../middlewares/idempotencyMiddleware.js";
import { requireBusinessOwnership } from "../middlewares/requireBusinessOwnership.js";
import { requireInvoiceEditable } from "../middlewares/requireInvoiceEditable.js";
import * as controller from "../controllers/invoices.controller.js";
import {
  invoiceCancelSchema,
  invoiceCreateSchema,
  invoiceIdSchema,
  invoiceListSchema,
  invoicePreviewSchema,
  invoiceTimelineSchema,
  invoiceUpdateSchema,
  documentDownloadSchema,
} from "../schemas/api.schemas.js";
import { z } from "zod";

const router = Router();
router.get(
  "/documents/:documentId/content",
  validateRequest(z.object({
    params: z.object({ documentId: z.string().uuid() }),
    query: z.object({ token: z.string().min(40).max(100) }),
    body: z.object({}),
  })),
  asyncHandler(controller.downloadInvoiceDocumentContent),
);
router.use(authenticateUser, loadBusinessContext, requireBusinessOwnership);
router.post("/preview", validateRequest(invoicePreviewSchema), asyncHandler(controller.previewInvoice));
router.post(
  "/",
  validateRequest(invoiceCreateSchema),
  idempotencyMiddleware,
  asyncHandler(controller.createInvoice),
);
router.get("/", validateRequest(invoiceListSchema), asyncHandler(controller.listInvoices));
router.get(
  "/documents/:documentId/download",
  validateRequest(documentDownloadSchema),
  asyncHandler(controller.getInvoiceDocumentDownload),
);
router.get(
  "/:invoiceId/preview",
  validateRequest(invoiceIdSchema),
  asyncHandler(controller.previewInvoiceDocument),
);
router.get(
  "/:invoiceId/pdf",
  validateRequest(invoiceIdSchema),
  asyncHandler(controller.downloadInvoicePdf),
);
router.get(
  "/:invoiceId/download",
  validateRequest(invoiceIdSchema),
  asyncHandler(controller.downloadInvoicePdf),
);
router.get(
  "/:invoiceId/upi-qr",
  validateRequest(invoiceIdSchema),
  asyncHandler(controller.getInvoiceUpiQr),
);
router.get(
  "/:invoiceId/documents",
  validateRequest(invoiceIdSchema),
  asyncHandler(controller.listInvoiceDocuments),
);
router.get(
  "/:invoiceId/timeline",
  validateRequest(invoiceTimelineSchema),
  asyncHandler(controller.getInvoiceTimeline),
);
router.get("/:invoiceId", validateRequest(invoiceIdSchema), asyncHandler(controller.getInvoice));
router.patch(
  "/:invoiceId",
  validateRequest(invoiceUpdateSchema),
  requireInvoiceEditable,
  asyncHandler(controller.updateInvoice),
);
router.post("/:invoiceId/issue", validateRequest(invoiceIdSchema), asyncHandler(controller.issueInvoice));
router.post("/:invoiceId/cancel", validateRequest(invoiceCancelSchema), asyncHandler(controller.cancelInvoice));
export default router;
