import { Router } from "express";
import { authenticateUser } from "../middlewares/authenticateUser.js";
import { loadBusinessContext } from "../middlewares/loadBusinessContext.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import { requireBusinessOwnership } from "../middlewares/requireBusinessOwnership.js";
import { auditLogMiddleware } from "../middlewares/auditLogMiddleware.js";
import * as controller from "../controllers/customers.controller.js";
import {
  customerCreateSchema,
  customerIdSchema,
  customerListSchema,
  customerUpdateSchema,
} from "../schemas/api.schemas.js";

const router = Router();
router.use(authenticateUser, loadBusinessContext, requireBusinessOwnership, auditLogMiddleware);
router.post("/", validateRequest(customerCreateSchema), asyncHandler(controller.createCustomer));
router.get("/", validateRequest(customerListSchema), asyncHandler(controller.listCustomers));
router.get("/:customerId", validateRequest(customerIdSchema), asyncHandler(controller.getCustomer));
router.patch("/:customerId", validateRequest(customerUpdateSchema), asyncHandler(controller.updateCustomer));
router.delete("/:customerId", validateRequest(customerIdSchema), asyncHandler(controller.deleteCustomer));
router.get("/:customerId/invoices", validateRequest(customerIdSchema), asyncHandler(controller.getCustomerInvoices));
router.get("/:customerId/payments", validateRequest(customerIdSchema), asyncHandler(controller.getCustomerPayments));
router.get("/:customerId/ledger", validateRequest(customerIdSchema), asyncHandler(controller.getCustomerLedger));
export default router;
