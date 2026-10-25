import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import apiRouter from "./routes/index.js";
import { openapi } from "./docs/openapi.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { checkDatabaseReadiness } from "./config/database.js";
import { AppError } from "./errors/AppError.js";
import { requestIdMiddleware } from "./middlewares/requestIdMiddleware.js";
import { rateLimitMiddleware } from "./middlewares/rateLimitMiddleware.js";
import { verifyRazorpayWebhook } from "./middlewares/verifyRazorpayWebhook.js";
import { verifyN8nWebhook } from "./middlewares/verifyN8nWebhook.js";
import { asyncHandler } from "./middlewares/asyncHandler.js";
import { razorpayWebhook, n8nDeliveryStatus } from "./controllers/webhooks.controller.js";
import { notFoundMiddleware, errorHandlerMiddleware } from "./middlewares/errorHandlerMiddleware.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const allowedOrigins = env.FRONTEND_ORIGINS.length
  ? env.FRONTEND_ORIGINS
  : env.NODE_ENV === "development"
    ? ["http://localhost:5173", "http://127.0.0.1:5173"]
    : [];
const configuredCors = cors({
  origin(origin, callback) {
    callback(null, Boolean(origin));
  },
  credentials: false,
  exposedHeaders: ["Content-Disposition"],
});

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use((req, res, next) => {
    const origin = req.get("origin");
    const requestOrigin = `${req.protocol}://${req.get("host")}`;
    const configuredAppOrigin = env.APP_BASE_URL ? new URL(env.APP_BASE_URL).origin : undefined;
    if (
      !origin ||
      origin === requestOrigin ||
      origin === configuredAppOrigin ||
      allowedOrigins.includes(origin)
    ) {
      if (origin && origin !== requestOrigin) {
        configuredCors(req, res, next);
        return;
      }
      next();
      return;
    }
    next(new AppError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed"));
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      customProps: (req) => ({ requestId: req.id }),
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ data: { status: "alive" }, meta: { requestId: res.getHeader("x-request-id") } });
  });
  app.get(
    "/ready",
    asyncHandler(async (req, res) => {
      try {
        await checkDatabaseReadiness();
      } catch {
        throw new AppError(503, "DEPENDENCY_NOT_READY", "A required dependency is unavailable");
      }
      res.json({
        data: {
          status: "ready",
          dependencies: { postgres: "available" },
        },
        meta: { requestId: req.id },
      });
    }),
  );

  app.post(
    "/api/v1/webhooks/razorpay",
    rateLimitMiddleware,
    express.raw({ type: "application/json", limit: "1mb" }),
    verifyRazorpayWebhook,
    asyncHandler(razorpayWebhook),
  );
  app.post(
    "/api/v1/webhooks/n8n/delivery-status",
    rateLimitMiddleware,
    express.raw({ type: "application/json", limit: "1mb" }),
    verifyN8nWebhook,
    asyncHandler(n8nDeliveryStatus),
  );

  app.use(express.json({ limit: "1mb" }));
  app.use("/api/v1", rateLimitMiddleware, apiRouter);
  app.get("/openapi.json", (_req, res) => res.json(openapi));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));
  app.use("/", express.static(path.resolve(dirname, "..", "public"), { index: "index.html" }));
  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}

export const app = createApp();
