import { Router } from "express";
import { authenticateUser } from "../middlewares/authenticateUser.js";
import { loadBusinessContext } from "../middlewares/loadBusinessContext.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireBusinessOwnership } from "../middlewares/requireBusinessOwnership.js";
import { auditLogMiddleware } from "../middlewares/auditLogMiddleware.js";
import * as controller from "../controllers/cashflow.controller.js";
import {
  cashEntryCreateSchema,
  cashEntryIdSchema,
  cashEntryListSchema,
  cashEntryUpdateSchema,
  cashSnapshotCreateSchema,
  emptySchema,
  forecastSchema,
  paymentListSchema,
} from "../schemas/api.schemas.js";

const router = Router();
router.use(authenticateUser, loadBusinessContext, requireBusinessOwnership, auditLogMiddleware);
router.post("/snapshots", validateRequest(cashSnapshotCreateSchema), asyncHandler(controller.createSnapshot));
router.get("/snapshots/latest", validateRequest(emptySchema), asyncHandler(controller.getLatestSnapshot));
router.get("/snapshots", validateRequest(paymentListSchema), asyncHandler(controller.listSnapshots));
router.post("/entries", validateRequest(cashEntryCreateSchema), asyncHandler(controller.createEntry));
router.get("/entries", validateRequest(cashEntryListSchema), asyncHandler(controller.listEntries));
router.get("/entries/:entryId", validateRequest(cashEntryIdSchema), asyncHandler(controller.getEntry));
router.patch("/entries/:entryId", validateRequest(cashEntryUpdateSchema), asyncHandler(controller.updateEntry));
router.delete("/entries/:entryId", validateRequest(cashEntryIdSchema), asyncHandler(controller.deleteEntry));
router.post("/forecast", validateRequest(forecastSchema), asyncHandler(controller.createForecast));
router.get("/forecast/latest", validateRequest(emptySchema), asyncHandler(controller.getForecast));
router.get("/risks", validateRequest(emptySchema), asyncHandler(controller.getRisks));
export default router;
