import rateLimit from "express-rate-limit";

export const rateLimitMiddleware = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
        requestId: req.id,
      },
    });
  },
});

export const authenticationRateLimitMiddleware = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many authentication attempts",
        requestId: req.id,
      },
    });
  },
});
