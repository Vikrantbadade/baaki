import { AppError } from "../errors/AppError.js";
import jwt from "jsonwebtoken";
import { pool, createUserDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { throwOnDatabaseError, withDatabaseContext } from "../utils/databaseResult.js";

export async function authenticateUser(req, _res, next) {
  const authorization = req.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    next(new AppError(401, "UNAUTHENTICATED", "A valid bearer token is required"));
    return;
  }

  let claims;
  try {
    claims = jwt.verify(match[1], env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "baaki-api",
      audience: "baaki-client",
    });
  } catch {
    next(new AppError(401, "UNAUTHENTICATED", "The access token is invalid or expired"));
    return;
  }

  if (
    typeof claims !== "object" ||
    typeof claims.sub !== "string" ||
    typeof claims.jti !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(claims.sub) ||
    !/^[0-9a-f-]{36}$/i.test(claims.jti)
  ) {
    next(new AppError(401, "UNAUTHENTICATED", "The access token is invalid or expired"));
    return;
  }

  const { data, error } = await withDatabaseContext(
    pool.query(
      `select u.id, u.email, u.created_at, s.expires_at
       from public.auth_sessions s
       join public.users u on u.id = s.user_id
       where s.id = $1 and s.user_id = $2 and s.revoked_at is null and s.expires_at > now()`,
      [claims.jti, claims.sub],
    ),
    "select",
    "auth_sessions",
    { single: true },
  );
  throwOnDatabaseError(error);
  if (!data) {
    next(new AppError(401, "UNAUTHENTICATED", "The access token is invalid or expired"));
    return;
  }

  req.user = { ...data, email_confirmed_at: null, tokenId: claims.jti };
  req.db = createUserDatabase(data.id);
  next();
}
