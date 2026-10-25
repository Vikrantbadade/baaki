import { Router } from "express";
import { authenticateUser } from "../middlewares/authenticateUser.js";
import { loadBusinessContext } from "../middlewares/loadBusinessContext.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireBusinessOwnership } from "../middlewares/requireBusinessOwnership.js";
import { auditLogMiddleware } from "../middlewares/auditLogMiddleware.js";
import * as controller from "../controllers/collectionPlans.controller.js";
import {
  collectionPlanCreateSchema,
  collectionPlanIdSchema,
  collectionPlanListSchema,
  collectionPlanPreviewSchema,
  collectionPlanRejectSchema,
  voiceInterpretationSchema,
} from "../schemas/api.schemas.js";

const router = Router();
router.use(authenticateUser, loadBusinessContext, requireBusinessOwnership, auditLogMiddleware);

router.post(
  "/interpret-voice",
  validateRequest(voiceInterpretationSchema),
  asyncHandler(controller.interpretVoice),
);

router.post(
  "/preview",
  validateRequest(collectionPlanPreviewSchema),
  asyncHandler(controller.previewPlan),
);

router.post(
  "/",
  validateRequest(collectionPlanCreateSchema),
  asyncHandler(controller.createPlan),
);

router.get(
  "/",
  validateRequest(collectionPlanListSchema),
  asyncHandler(controller.listPlans),
);

router.get(
  "/:planId",
  validateRequest(collectionPlanIdSchema),
  asyncHandler(controller.getPlan),
);

router.post(
  "/:planId/approve",
  validateRequest(collectionPlanIdSchema),
  asyncHandler(controller.approvePlan),
);

router.post(
  "/:planId/reject",
  validateRequest(collectionPlanRejectSchema),
  asyncHandler(controller.rejectPlan),
);

router.post(
  "/:planId/cancel",
  validateRequest(collectionPlanIdSchema),
  asyncHandler(controller.cancelPlan),
);

router.post(
  "/:planId/execute",
  validateRequest(collectionPlanIdSchema),
  asyncHandler(controller.executePlan),
);

export default router;
