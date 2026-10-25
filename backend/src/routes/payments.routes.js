import { Router } from "express";
import { authenticateUser } from "../middlewares/authenticateUser.js";
import { loadBusinessContext } from "../middlewares/loadBusinessContext.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { idempotencyMiddleware } from "../middlewares/idempotencyMiddleware.js";
import { requireBusinessOwnership } from "../middlewares/requireBusinessOwnership.js";
import { auditLogMiddleware } from "../middlewares/auditLogMiddleware.js";
import * as controller from "../controllers/payments.controller.js";
import {
  allocationCreateSchema,
  paymentCreateSchema,
  paymentIdSchema,
  paymentListSchema,
} from "../schemas/api.schemas.js";

const router = Router();
router.use(authenticateUser, loadBusinessContext, requireBusinessOwnership, auditLogMiddleware);
router.post(
  "/",
  validateRequest(paymentCreateSchema),
  idempotencyMiddleware,
  asyncHandler(controller.createPayment),
);
router.get("/", validateRequest(paymentListSchema), asyncHandler(controller.listPayments));
router.get("/:paymentId", validateRequest(paymentIdSchema), asyncHandler(controller.getPayment));
router.post(
  "/:paymentId/allocations",
  validateRequest(allocationCreateSchema),
  idempotencyMiddleware,
  asyncHandler(controller.createAllocations),
);
router.get("/:paymentId/allocations", validateRequest(paymentIdSchema), asyncHandler(controller.listAllocations));
export default router;
