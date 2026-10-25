import { apiDownload, apiRequest, ApiError } from './apiClient'

export interface Business {
  id: string
  name: string
  legal_name?: string | null
  gstin?: string | null
}

export interface Customer {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  tax_id?: string | null
}

export interface InvoiceItem {
  id?: string
  description: string
  quantity: number
  unit_price_paise: number
  subtotal_paise: number
  tax_paise: number
  total_paise: number
  discount_bps?: number
  tax_rate_bps?: number
}

export interface Invoice {
  id: string
  invoice_number: string | null
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled'
  customer_id: string
  issue_date: string | null
  due_date: string | null
  total_paise: number
  paid_amount_paise: number
  outstanding_paise: number
  currency: 'INR'
  created_at: string
  invoice_items?: InvoiceItem[]
}

export interface CashSnapshot {
  amount_paise: number
  recorded_at: string
}

export interface CashflowEntry {
  id: string
  direction: 'inflow' | 'outflow'
  amount_paise: number
  due_date: string
  is_actual: boolean
  category: string
  description: string | null
}

export interface ForecastDay {
  date: string
  actualInflowPaise: number
  actualOutflowPaise: number
  estimatedInflowPaise: number
  estimatedOutflowPaise: number
  projectedBalancePaise: number
}

export interface CashflowForecast {
  startingBalancePaise: number
  horizonDays: number
  dailyBalances: ForecastDay[]
  shortageDate: string | null
  cashGapPaise: number
  isEstimate: boolean
}

interface Page<T> {
  items: T[]
  page: number
  limit: number
  total: number
}

interface InvoiceLineInput {
  description: string
  quantityMilli: number
  unitPricePaise: number
  discountBps?: number
  taxRateBps?: number
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value)
}

function idempotencyKey(): string {
  return crypto.randomUUID()
}

async function getAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = []
  const limit = 100
  let page = 1
  let total = 0

  do {
    const separator = path.includes('?') ? '&' : '?'
    const result = await apiRequest<Page<T>>(`${path}${separator}page=${page}&limit=${limit}`)
    if (!Array.isArray(result.items) || !Number.isFinite(result.total)) {
      throw new ApiError('The BAAKI API returned an invalid paginated response.', 200, 'INVALID_RESPONSE')
    }
    items.push(...result.items)
    total = result.total
    page += 1
    if (page > 1001) {
      throw new ApiError('The result contains too many records to load at once.', 0, 'RESULT_LIMIT')
    }
  } while (items.length < total)

  return items
}

export const getBusiness = () => apiRequest<Business>('/businesses/current')
export const getAllCustomers = () => getAllPages<Customer>('/customers')
export const getAllInvoices = () => getAllPages<Invoice>('/invoices')

export const getInvoice = (invoiceId: string) => apiRequest<Invoice>(`/invoices/${encodeURIComponent(invoiceId)}`)

export const previewInvoice = (items: InvoiceLineInput[]) =>
  apiRequest<{ subtotalPaise: number; taxPaise: number; totalPaise: number }>('/invoices/preview', {
    method: 'POST',
    body: jsonBody({ items }),
  })

export function createInvoice(input: {
  customerId: string
  issueDate?: string
  dueDate?: string
  items: InvoiceLineInput[]
}) {
  return apiRequest<Invoice>('/invoices', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    body: jsonBody(input),
  })
}

export const updateInvoiceDraft = (invoiceId: string, input: {
  customerId: string
  issueDate?: string
  dueDate?: string
  items: InvoiceLineInput[]
}) =>
  apiRequest<Invoice>(`/invoices/${encodeURIComponent(invoiceId)}`, {
    method: 'PATCH',
    body: jsonBody(input),
  })

export const issueInvoice = (invoiceId: string) =>
  apiRequest<Invoice>(`/invoices/${encodeURIComponent(invoiceId)}/issue`, { method: 'POST' })

export const cancelInvoice = (invoiceId: string, reason: string) =>
  apiRequest<Invoice>(`/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
    method: 'POST',
    body: jsonBody({ reason }),
  })

export const recordPayment = (input: {
  customerId: string
  amountPaise: number
  method: 'cash' | 'bank_transfer' | 'cheque' | 'other'
  reference?: string
  allocations: Array<{ invoiceId: string; amountPaise: number }>
}) =>
  apiRequest('/payments', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey() },
    body: jsonBody(input),
  })

export const listInvoiceTimeline = (invoiceId: string) =>
  apiRequest<Page<{ id: string; event_type: string; created_at: string }>>(`/invoices/${encodeURIComponent(invoiceId)}/timeline?page=1&limit=100`)

export interface InvoiceDocument {
  id: string
  invoice_id: string
  document_type: string
  original_filename: string
  mime_type: string
  byte_size: number
  created_at: string
}

export const getInvoiceDocuments = (invoiceId: string) =>
  apiRequest<InvoiceDocument[]>(`/invoices/${encodeURIComponent(invoiceId)}/documents`)

export const getInvoiceDocumentDownload = (documentId: string) =>
  apiRequest<{ url: string; expiresInSeconds: number }>(`/invoices/documents/${encodeURIComponent(documentId)}/download`)

export const downloadInvoicePdf = (invoiceId: string) =>
  apiDownload(`/invoices/${encodeURIComponent(invoiceId)}/pdf`)

export interface InvoiceUpiQr {
  paymentUri: string
  dataUrl: string
  amountPaise: number
  currency: 'INR'
}

export const getInvoiceUpiQr = (invoiceId: string) =>
  apiRequest<InvoiceUpiQr>(`/invoices/${encodeURIComponent(invoiceId)}/upi-qr`)

export async function getCashSnapshots(): Promise<Page<CashSnapshot>> {
  return apiRequest<Page<CashSnapshot>>('/cashflow/snapshots?page=1&limit=100')
}

export async function getLatestCashSnapshot(): Promise<CashSnapshot | null> {
  try {
    return await apiRequest<CashSnapshot>('/cashflow/snapshots/latest')
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export const recordCashSnapshot = (amountPaise: number) =>
  apiRequest<CashSnapshot>('/cashflow/snapshots', {
    method: 'POST',
    body: jsonBody({ amountPaise }),
  })

export const createCashflowForecast = (horizonDays: number) =>
  apiRequest<CashflowForecast>('/cashflow/forecast', {
    method: 'POST',
    body: jsonBody({ horizonDays }),
  })

export async function getLatestForecast(): Promise<CashflowForecast | null> {
  try {
    return await apiRequest<CashflowForecast>('/cashflow/forecast/latest')
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function getCashflowEntries(from: string, to: string): Promise<CashflowEntry[]> {
  return getAllPages<CashflowEntry>(`/cashflow/entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
}

export const createCashflowEntry = (input: {
  direction: 'inflow' | 'outflow'
  amountPaise: number
  dueDate: string
  category: string
  description?: string
  isActual: boolean
}) =>
  apiRequest<CashflowEntry>('/cashflow/entries', {
    method: 'POST',
    body: jsonBody(input),
  })

export const deleteCashflowEntry = (entryId: string) =>
  apiRequest<void>(`/cashflow/entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' })

export async function getUpcomingCashflowEntries(): Promise<CashflowEntry[]> {
  const today = new Date().toISOString().slice(0, 10)
  const endDate = new Date()
  endDate.setDate(endDate.getDate() + 12)
  return getCashflowEntries(today, endDate.toISOString().slice(0, 10))
}
