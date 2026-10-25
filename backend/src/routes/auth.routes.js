import { Router } from "express";
import { authenticateUser } from "../middlewares/authenticateUser.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { emptySchema } from "../schemas/api.schemas.js";
import { getCurrentUser } from "../controllers/auth.controller.js";

const router = Router();
router.get("/me", authenticateUser, validateRequest(emptySchema), getCurrentUser);
export default router;
