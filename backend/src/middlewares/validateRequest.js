import { AppError } from "../errors/AppError.js";

export function validateRequest(schema) {
  return function validate(req, _res, next) {
    const result = schema.safeParse({
      params: req.params,
      query: req.query,
      body: req.body ?? {},
    });

    if (!result.success) {
      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "Request validation failed",
          result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        ),
      );
      return;
    }

    req.validated = result.data;
    next();
  };
}
