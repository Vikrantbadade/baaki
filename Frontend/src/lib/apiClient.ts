import { supabase } from './supabase'

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
const apiBaseUrl = configuredBaseUrl?.replace(/\/+$/, '')
const apiPrefix = '/api/v1'
const requestTimeoutMs = 15_000

interface ApiEnvelope<T> {
  data: T
}

interface ApiErrorPayload {
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

interface ApiResponseHandle {
  response: Response
  signal: AbortSignal
  cleanup: () => void
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function endpointUrl(path: string): string {
  if (!apiBaseUrl) {
    throw new ApiError('Set VITE_API_BASE_URL in Frontend/.env to connect to BAAKI.', 0)
  }

  const prefix = apiBaseUrl.endsWith(apiPrefix) ? '' : apiPrefix
  return `${apiBaseUrl}${prefix}${path.startsWith('/') ? path : `/${path}`}`
}

function isJsonContentType(contentType: string | null): boolean {
  return Boolean(contentType?.includes('application/json') || contentType?.includes('+json'))
}

async function readError(response: Response): Promise<ApiError> {
  let payload: ApiErrorPayload | undefined
  if (isJsonContentType(response.headers.get('content-type'))) {
    try {
      payload = (await response.json()) as ApiErrorPayload
    } catch {
      payload = undefined
    }
  }

  return new ApiError(
    payload?.error?.message ?? `The request failed (${response.status}).`,
    response.status,
    payload?.error?.code,
    payload?.error?.details,
  )
}

function timeoutError(): ApiError {
  return new ApiError('The request timed out. Please try again.', 0, 'REQUEST_TIMEOUT')
}

async function sendRequest(path: string, options: RequestInit = {}): Promise<ApiResponseHandle> {
  if (!supabase) {
    throw new ApiError('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Frontend/.env to sign in.', 0)
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) throw new ApiError('Could not restore the sign-in session. Please sign in again.', 0)
  const accessToken = data.session?.access_token
  if (!accessToken) throw new ApiError('Sign in to access your business data.', 401, 'UNAUTHENTICATED')

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
  const externalSignal = options.signal
  const abortFromCaller = () => controller.abort()
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  if (externalSignal?.aborted) controller.abort()
  const cleanup = () => {
    window.clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  const hasBody = options.body !== undefined && options.body !== null
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const isBinaryBody = typeof Blob !== 'undefined' && options.body instanceof Blob
  if (hasBody && !isFormData && !isBinaryBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    const response = await fetch(endpointUrl(path), {
      ...options,
      headers,
      signal: controller.signal,
    })

    if (response.status === 401) {
      const apiError = await readError(response)
      if (apiError.code === 'UNAUTHENTICATED') {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) {
          throw new ApiError('Your session has expired. Please sign in again.', 401, apiError.code)
        }
      }
      throw apiError
    }

    if (!response.ok) throw await readError(response)
    return { response, signal: controller.signal, cleanup }
  } catch (error) {
    cleanup()
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted) throw timeoutError()
    throw new ApiError('Could not connect to the BAAKI API. Check the backend server and try again.', 0, 'NETWORK_ERROR')
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { response, signal, cleanup } = await sendRequest(path, options)
  try {
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T
    }

    if (!isJsonContentType(response.headers.get('content-type'))) {
      throw new ApiError('The BAAKI API returned an unexpected response format.', response.status, 'INVALID_RESPONSE')
    }

    let payload: ApiEnvelope<T>
    try {
      payload = (await response.json()) as ApiEnvelope<T>
    } catch (error) {
      if (signal.aborted) throw timeoutError()
      if (error instanceof ApiError) throw error
      throw new ApiError('The BAAKI API returned unreadable JSON.', response.status, 'INVALID_RESPONSE')
    }
    if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
      throw new ApiError('The BAAKI API response did not contain data.', response.status, 'INVALID_RESPONSE')
    }
    return payload.data
  } finally {
    cleanup()
  }
}

export async function apiText(path: string): Promise<string> {
  const { response, signal, cleanup } = await sendRequest(path, { headers: { Accept: 'text/html' } })
  try {
    if (!response.headers.get('content-type')?.includes('text/html')) {
      throw new ApiError('The BAAKI API returned an unexpected document format.', response.status, 'INVALID_RESPONSE')
    }
    return await response.text()
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (signal.aborted) throw timeoutError()
    throw new ApiError('The BAAKI API response could not be read.', response.status, 'INVALID_RESPONSE')
  } finally {
    cleanup()
  }
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const { response, signal, cleanup } = await sendRequest(path, { headers: { Accept: 'application/pdf, application/octet-stream' } })
  try {
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('application/pdf') && !contentType?.includes('application/octet-stream')) {
      throw new ApiError('The BAAKI API returned an unexpected file format.', response.status, 'INVALID_RESPONSE')
    }
    const disposition = response.headers.get('content-disposition')
    const filename = disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? null
    return { blob: await response.blob(), filename }
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (signal.aborted) throw timeoutError()
    throw new ApiError('The BAAKI API file could not be downloaded.', response.status, 'INVALID_RESPONSE')
  } finally {
    cleanup()
  }
}
