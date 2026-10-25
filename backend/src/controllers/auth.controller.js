import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { pool, withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import { withDatabaseOperation } from "../utils/databaseResult.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

function issueToken(user) {
  const tokenId = randomUUID();
  const token = jwt.sign(
    { email: user.email },
    env.JWT_SECRET,
    {
      algorithm: "HS256",
      subject: user.id,
      jwtid: tokenId,
      issuer: "baaki-api",
      audience: "baaki-client",
      expiresIn: env.JWT_ACCESS_TOKEN_TTL,
    },
  );
  const claims = jwt.decode(token);
  return { token, tokenId, expiresAt: new Date(claims.exp * 1000) };
}

async function createSession(user) {
  const { token, tokenId, expiresAt } = issueToken(user);
  await withDatabaseOperation(
    pool.query(
      "insert into public.auth_sessions (id, user_id, expires_at) values ($1, $2, $3)",
      [tokenId, user.id, expiresAt],
    ),
    "insert",
    "auth_sessions",
  );
  return token;
}

function authResponse(res, req, user, accessToken, status = 200) {
  res.status(status).json({
    data: {
      accessToken,
      tokenType: "Bearer",
      user: {
        id: user.id,
        email: user.email,
        emailConfirmedAt: null,
        createdAt: user.created_at,
      },
    },
    meta: { requestId: req.id },
  });
}

export async function register(req, res) {
  const { email, password } = req.validated.body;
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);
  try {
    const user = await withDatabaseOperation(withTransaction(null, async (db) => {
      const result = await db.query(
        `insert into public.users (email, password_hash)
         values ($1, $2)
         returning id, email, created_at`,
        [normalizedEmail, passwordHash],
      );
      const createdUser = result.rows[0];
      const { token, tokenId, expiresAt } = issueToken(createdUser);
      await db.query(
        "insert into public.auth_sessions (id, user_id, expires_at) values ($1, $2, $3)",
        [tokenId, createdUser.id, expiresAt],
      );
      return { user: createdUser, token };
    }), "insert", "users");
    authResponse(res, req, user.user, user.token, 201);
  } catch (error) {
    if (error.code === "23505") {
      throw new AppError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists");
    }
    throw error;
  }
}

export async function login(req, res) {
  const { email, password } = req.validated.body;
  const result = await withDatabaseOperation(
    pool.query(
      `select id, email, password_hash, created_at
       from public.users where lower(email) = lower($1)`,
      [email.trim()],
    ),
    "select",
    "users",
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
  }
  const accessToken = await createSession(user);
  authResponse(res, req, user, accessToken);
}

export async function logout(req, res) {
  await withDatabaseOperation(
    pool.query(
      "update public.auth_sessions set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null",
      [req.user.tokenId, req.user.id],
    ),
    "update",
    "auth_sessions",
  );
  res.json({ data: { success: true }, meta: { requestId: req.id } });
}

export async function getCurrentUser(req, res) {
  res.json({
    data: {
      id: req.user.id,
      email: req.user.email,
      emailConfirmedAt: req.user.email_confirmed_at,
      createdAt: req.user.created_at,
    },
    meta: { requestId: req.id },
  });
}

export async function requestPasswordReset() {
  throw new AppError(501, "PASSWORD_RESET_UNAVAILABLE", "Password reset delivery is not configured");
}

export async function updatePassword(req, res) {
  const { password } = req.validated.body;
  const passwordHash = await hashPassword(password);
  await withDatabaseOperation(withTransaction(null, async (db) => {
    await db.query("update public.users set password_hash = $1, updated_at = now() where id = $2", [
      passwordHash,
      req.user.id,
    ]);
    await db.query(
      "update public.auth_sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null",
      [req.user.id, req.user.tokenId],
    );
  }), "update", "users");
  res.json({ data: { success: true }, meta: { requestId: req.id } });
}
