import { Router } from "express";
import authRoutes from "./auth.routes.js";
import businessRoutes from "./business.routes.js";
import customersRoutes from "./customers.routes.js";
import invoicesRoutes from "./invoices.routes.js";
import paymentsRoutes from "./payments.routes.js";
import cashflowRoutes from "./cashflow.routes.js";
import collectionPlansRoutes from "./collectionPlans.routes.js";

const router = Router();
router.use("/auth", authRoutes);
router.use("/businesses", businessRoutes);
router.use("/customers", customersRoutes);
router.use("/invoices", invoicesRoutes);
router.use("/payments", paymentsRoutes);
router.use("/cashflow", cashflowRoutes);
router.use("/collection-plans", collectionPlansRoutes);

export default router;
