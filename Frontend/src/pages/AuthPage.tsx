import { useState, useId } from 'react'
import { LockKeyhole, Mail, Phone } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { requestPasswordReset, signInWithEmail, signUpWithEmail, signInWithPhone, updatePassword } from '../lib/authService'
import './AuthPage.css'

type AuthMode = 'signin' | 'signup' | 'reset'

/* ── Validation ─────────────────────────────────────────────── */
function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email address is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.'
  return null
}

function validatePassword(password: string, mode: AuthMode): string | null {
  if (!password) return 'Password is required.'
  if (mode !== 'signin' && password.length < 8)
    return 'Password must be at least 8 characters.'
  return null
}

export default function AuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const emailId   = useId()
  const passwordId = useId()

  const [mode, setMode]           = useState<AuthMode>(searchParams.get('flow') === 'recovery' ? 'reset' : 'signin')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [emailError, setEmailError]     = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError]   = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)

  /* ── Mode switch ─────────────────────────────────────────── */
  function handleModeSwitch(newMode: AuthMode) {
    if (newMode === mode) return
    setMode(newMode)
    setEmailError(null)
    setPasswordError(null)
    setFormError(null)
    setFormSuccess(null)
  }

  async function handlePasswordResetRequest() {
    const emailErr = validateEmail(email)
    setEmailError(emailErr)
    setFormError(null)
    setFormSuccess(null)
    if (emailErr) return
    setLoading(true)
    try {
      const result = await requestPasswordReset(email)
      if (!result.success) setFormError(result.error ?? 'Could not request a password reset.')
      else setFormSuccess('If an account exists for this address, a password-reset email has been sent.')
    } catch {
      setFormError('Could not request a password reset. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Field-level validation ─────────────────────────────── */
  function handleEmailBlur() {
    setEmailError(validateEmail(email))
  }

  function handlePasswordBlur() {
    setPasswordError(validatePassword(password, mode))
  }

  /* ── Submit ──────────────────────────────────────────────── */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    const emailErr    = mode === 'reset' ? null : validateEmail(email)
    const passwordErr = validatePassword(password, mode)
    setEmailError(emailErr)
    setPasswordError(passwordErr)
    if (emailErr || passwordErr) return

    setLoading(true)

    try {
      const result = mode === 'reset'
        ? await updatePassword(password)
        : mode === 'signin'
          ? await signInWithEmail(email, password)
          : await signUpWithEmail(email, password)

      if (!result.success) {
        setFormError(result.error ?? 'Something went wrong. Please try again.')
      } else {
        if (mode === 'signup') {
          setFormSuccess(
            'Account created! Check your email to confirm your address before signing in.'
          )
        } else if (mode === 'reset') {
          setFormSuccess('Password updated successfully.')
          navigate('/dashboard', { replace: true })
        } else {
          setFormSuccess('Signed in successfully.')
          navigate('/dashboard', { replace: true })
        }
      }
    } catch {
      setFormError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* ── Phone alt sign-in ───────────────────────────────────── */
  async function handlePhoneClick() {
    const result = await signInWithPhone()
    if (!result.success) {
      setFormError(result.error ?? 'Phone sign-in is unavailable.')
    }
  }

  return (
    <div className="page-wrapper">
      <main className="auth-layout" aria-label="BAAKI Authentication">
        {/* Left Column */}
        <section className="auth-left" aria-labelledby="auth-heading">
          <div className="auth-inner">
          {/* Brand */}
          <div className="auth-brand">
            <img
              src="/assets/brand/rupee_logo.png"
              alt="BAAKI rupee logo"
              className="auth-rupee-logo"
              width={26}
              height={26}
            />
            <span className="auth-wordmark">BAAKI</span>
          </div>

          {/* Instruction */}
          <p className="auth-instruction" id="auth-heading">
          {mode === 'reset' ? 'Choose a new password for your account.' : 'Welcome back! Please enter your details.'}
          </p>

          {/* Segmented control */}
          {mode !== 'reset' && <div
            className="auth-segmented"
            role="tablist"
            aria-label="Sign in or sign up"
          >
            <button
              id="tab-signin"
              role="tab"
              aria-selected={mode === 'signin'}
              className={`auth-tab ${mode === 'signin' ? 'auth-tab--active' : ''}`}
              onClick={() => handleModeSwitch('signin')}
              type="button"
            >
              Sign In
            </button>
            <button
              id="tab-signup"
              role="tab"
              aria-selected={mode === 'signup'}
              className={`auth-tab ${mode === 'signup' ? 'auth-tab--active' : ''}`}
              onClick={() => handleModeSwitch('signup')}
              type="button"
            >
              Sign Up
            </button>
          </div>}

          {/* Form */}
          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
            aria-label={mode === 'reset' ? 'Reset password form' : mode === 'signin' ? 'Sign in form' : 'Sign up form'}
          >
            {mode !== 'reset' && (
              <div className={`auth-field-group ${emailError ? 'auth-field-group--error' : ''}`}>
                <label className="auth-label" htmlFor={emailId}>Email address</label>
                <div className="auth-input-wrapper">
                  <Mail className="auth-input-icon" size={18} aria-hidden="true" />
                  <input
                    id={emailId}
                    type="email"
                    className="auth-input"
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value)
                      if (emailError) setEmailError(null)
                    }}
                    onBlur={handleEmailBlur}
                    required
                    autoComplete="email"
                    aria-describedby={emailError ? `${emailId}-error` : undefined}
                    aria-invalid={Boolean(emailError)}
                    disabled={loading}
                  />
                  {email && !emailError && <span className="auth-input-valid" aria-hidden="true">✓</span>}
                </div>
                {emailError && <p id={`${emailId}-error`} className="auth-field-error" role="alert">{emailError}</p>}
              </div>
            )}

            {/* Password */}
            <div className={`auth-field-group ${passwordError ? 'auth-field-group--error' : ''}`}>
              <label className="auth-label" htmlFor={passwordId}>
                {mode === 'reset' ? 'New password' : 'Password'}
              </label>
              <div className="auth-input-wrapper">
                <LockKeyhole
                  className="auth-input-icon auth-lock-icon"
                  size={18}
                  aria-hidden="true"
                />
                <input
                  id={passwordId}
                  type="password"
                  className="auth-input"
                  placeholder={mode === 'reset' ? 'Enter new password' : 'Enter password'}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (passwordError) setPasswordError(null)
                  }}
                  onBlur={handlePasswordBlur}
                  required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  aria-describedby={passwordError ? `${passwordId}-error` : undefined}
                  aria-invalid={Boolean(passwordError)}
                  disabled={loading}
                  minLength={mode === 'signin' ? undefined : 8}
                />
              </div>
              {passwordError && (
                <p id={`${passwordId}-error`} className="auth-field-error" role="alert">
                  {passwordError}
                </p>
              )}
            </div>

            {/* Form-level error / success */}
            {formError && (
              <div className="auth-form-error" role="alert">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="auth-form-success" role="status">
                {formSuccess}
              </div>
            )}

            {mode === 'signin' && <button type="button" className="auth-reset-link" onClick={() => void handlePasswordResetRequest()} disabled={loading}>Forgot password?</button>}
            {mode === 'reset' && <button type="button" className="auth-reset-link" onClick={() => handleModeSwitch('signin')}>Back to sign in</button>}

            {/* Continue button */}
            <button
              id="auth-continue-btn"
              type="submit"
              className="auth-submit"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? 'Please wait…' : mode === 'reset' ? 'Update password' : 'Continue'}
            </button>
          </form>

          {/* Alt sign-in */}
          {mode !== 'reset' && (
            <div className="auth-alt">
              <span className="auth-alt-label">Or Continue With</span>
              <div className="auth-alt-buttons">
                <button
                  id="auth-email-alt-btn"
                  type="button"
                  className="auth-alt-btn"
                  aria-label="Continue with email link"
                  onClick={() => setFormError('Magic link sign-in is not yet configured.')}
                >
                  <Mail size={30} aria-hidden="true" />
                </button>
                <button
                  id="auth-phone-btn"
                  type="button"
                  className="auth-alt-btn auth-alt-btn--phone"
                  aria-label="Continue with phone number"
                  onClick={handlePhoneClick}
                >
                  <Phone size={26} aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* Footer text */}
          <p className="auth-footer-text">
            Stay ahead of your business finances.
            <br />
            Log in to track payments, anticipate cash gaps, and plan your next move.
          </p>
          </div>
        </section>

        {/* Right Column — Poster */}
        <aside className="poster-panel" aria-label="BAAKI poster artwork">
          <img
            src="/assets/illustrations/Opening.png"
            alt="In this economy, and you're not productive? — BAAKI editorial poster"
            className="poster-image"
          />
        </aside>
      </main>
    </div>
  )
}
