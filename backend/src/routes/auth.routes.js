import { Router } from "express";
import { authenticateUser } from "../middlewares/authenticateUser.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { emptySchema } from "../schemas/api.schemas.js";
import { z } from "zod";
import {
  getCurrentUser,
  login,
  logout,
  register,
  requestPasswordReset,
  updatePassword,
} from "../controllers/auth.controller.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { authenticationRateLimitMiddleware } from "../middlewares/rateLimitMiddleware.js";
import { env } from "../config/env.js";

const router = Router();
const credentialsSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  }),
});
const loginCredentialsSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128),
  }),
}).superRefine(({ email, password }, context) => {
  const isLocalDemoAccount =
    env.NODE_ENV === "development" &&
    email.trim().toLowerCase() === "vikrant.badade50@spit.ac.in";
  if (password.length < 8 && !isLocalDemoAccount) {
    context.addIssue({
      code: "custom",
      path: ["password"],
      message: "Password must contain at least 8 characters",
    });
  }
});
const resetRequestSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({ email: z.string().trim().email().max(254) }),
});
const passwordUpdateSchema = z.object({
  params: z.object({}),
  query: z.object({}),
  body: z.object({ password: z.string().min(8).max(128) }),
});

router.post("/register", authenticationRateLimitMiddleware, validateRequest(credentialsSchema), asyncHandler(register));
router.post("/signup", authenticationRateLimitMiddleware, validateRequest(credentialsSchema), asyncHandler(register));
router.post("/login", authenticationRateLimitMiddleware, validateRequest(loginCredentialsSchema), asyncHandler(login));
router.post("/logout", authenticateUser, asyncHandler(logout));
router.post("/password-reset", authenticationRateLimitMiddleware, validateRequest(resetRequestSchema), asyncHandler(requestPasswordReset));
router.post("/password", authenticateUser, validateRequest(passwordUpdateSchema), asyncHandler(updatePassword));
router.get("/me", authenticateUser, validateRequest(emptySchema), asyncHandler(getCurrentUser));
export default router;
