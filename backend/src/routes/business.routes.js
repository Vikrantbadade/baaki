import { Router } from "express";
import { authenticateUser } from "../middlewares/authenticateUser.js";
import { loadBusinessContext } from "../middlewares/loadBusinessContext.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import * as controller from "../controllers/business.controller.js";
import { businessCreateSchema, businessUpdateSchema, emptySchema } from "../schemas/api.schemas.js";

const router = Router();

router.post("/", authenticateUser, validateRequest(businessCreateSchema), controller.createBusiness);
router.get("/current", authenticateUser, validateRequest(emptySchema), controller.getCurrentBusiness);
router.patch(
  "/current",
  authenticateUser,
  loadBusinessContext,
  validateRequest(businessUpdateSchema),
  controller.updateCurrentBusiness,
);

export default router;
