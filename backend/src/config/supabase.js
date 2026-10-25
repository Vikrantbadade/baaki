import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";
import { AppError } from "../errors/AppError.js";

export function createUserSupabaseClient(accessToken) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export function createServiceRoleClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError(503, "SUPABASE_ADMIN_NOT_CONFIGURED", "This server-side privileged operation is not configured");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function checkSupabaseReadiness() {
  const headers = { apikey: env.SUPABASE_ANON_KEY };
  const checks = [
    fetch(`${env.SUPABASE_URL}/auth/v1/health`, {
      headers,
      signal: AbortSignal.timeout(3000),
    }),
    fetch(`${env.SUPABASE_URL}/rest/v1/`, {
      method: "OPTIONS",
      headers,
      signal: AbortSignal.timeout(3000),
    }),
  ];
  const responses = await Promise.all(checks);
  if (responses.some((response) => !response.ok)) {
    throw new Error("Supabase Auth or PostgreSQL REST health check failed");
  }
}
