export function auditLogMiddleware(req, res, next) {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    next();
    return;
  }
  res.on("finish", () => {
    if (res.statusCode >= 400 || !req.business || !req.user) return;
    req.log?.info(
      {
        audit: true,
        businessId: req.business.id,
        actorUserId: req.user.id,
        method: req.method,
        route: req.route?.path,
        statusCode: res.statusCode,
      },
      "Business mutation completed",
    );
  });
  next();
}
