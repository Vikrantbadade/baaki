/**
 * BAAKI Auth Service
 * Wraps Supabase Auth methods used by the sign-in / sign-up flow.
 */
import { supabase, isSupabaseConfigured } from './supabase'

export interface AuthResult {
  success: boolean
  error?: string
}

function notConfiguredError(): AuthResult {
  return {
    success: false,
    error:
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Frontend/.env to enable sign-in.',
  }
}

/**
 * Sign in with email + password using Supabase Auth.
 * Returns the Supabase access token on success (for use with the Express API).
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) return notConfiguredError()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

/**
 * Sign up with email + password.
 * Supabase sends a confirmation email by default.
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) return notConfiguredError()

  const { error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

/**
 * Phone sign-in is not currently implemented.
 * If Supabase Phone Auth is enabled, this can be extended.
 */
export async function signInWithPhone(): Promise<AuthResult> {
  return {
    success: false,
    error: 'Phone sign-in is not configured. Please use email.',
  }
}

export async function signOut(): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) return notConfiguredError()
  const { error } = await supabase.auth.signOut()
  return error ? { success: false, error: error.message } : { success: true }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) return notConfiguredError()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth?flow=recovery`,
  })
  return error ? { success: false, error: error.message } : { success: true }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured || !supabase) return notConfiguredError()
  const { error } = await supabase.auth.updateUser({ password })
  return error ? { success: false, error: error.message } : { success: true }
}
