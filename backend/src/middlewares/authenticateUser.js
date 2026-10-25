import { AppError } from "../errors/AppError.js";
import { createUserSupabaseClient } from "../config/supabase.js";

export async function authenticateUser(req, _res, next) {
  const authorization = req.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    next(new AppError(401, "UNAUTHENTICATED", "A valid bearer token is required"));
    return;
  }

  const supabase = createUserSupabaseClient(match[1]);
  const { data, error } = await supabase.auth.getUser(match[1]);

  if (error || !data.user) {
    next(new AppError(401, "UNAUTHENTICATED", "The access token is invalid or expired"));
    return;
  }

  req.user = data.user;
  req.supabase = supabase;
  next();
}
