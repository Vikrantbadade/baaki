import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  Plus,
  Search,
  X,
} from 'lucide-react'
import BusinessSidebar from '../components/BusinessSidebar'
import { apiText } from '../lib/apiClient'
import {
  cancelInvoice,
  createInvoice,
  downloadInvoicePdf,
  getAllCustomers,
  getAllInvoices,
  getBusiness,
  getInvoiceDocumentDownload,
  getInvoiceDocuments,
  getInvoice,
  issueInvoice,
  getInvoiceUpiQr,
  listInvoiceTimeline,
  recordPayment,
  updateInvoiceDraft,
  type Business,
  type Customer,
  type InvoiceDocument,
  type Invoice,
} from '../lib/businessData'
import './InvoicesPage.css'

type InvoiceFilter = 'all' | 'outstanding' | 'overdue' | 'paid' | 'drafts'
type InvoiceForm = 'create' | 'edit' | 'payment' | null

interface InvoicesData {
  business: Business
  customers: Customer[]
  invoices: Invoice[]
}

interface InvoiceDraftInput {
  customerId: string
  description: string
  amount: string
  taxRate: string
  issueDate: string
  dueDate: string
}

const pageSize = 10
const currencyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const todayKey = () => new Date().toISOString().slice(0, 10)

function formatMoney(paise: number | string | null | undefined): string {
  if (paise === null || paise === undefined || paise === '') return '—'
  const amount = Number(paise)
  return Number.isFinite(amount) ? `₹${currencyFormatter.format(amount / 100)}` : '—'
}

function getDaysOverdue(dueDate: string | null): number {
  if (!dueDate || dueDate >= todayKey()) return 0
  return Math.floor((new Date(`${todayKey()}T00:00:00`).getTime() - new Date(`${dueDate}T00:00:00`).getTime()) / 86400000)
}

function statusLabel(invoice: Invoice): string {
  if (invoice.status === 'draft') return 'Draft'
  if (invoice.status === 'cancelled') return 'Cancelled'
  if (invoice.status === 'paid') return 'Paid'
  if (getDaysOverdue(invoice.due_date) > 0 && invoice.outstanding_paise > 0) return 'Overdue'
  if (invoice.due_date && invoice.due_date >= todayKey() && invoice.due_date <= addDays(todayKey(), 7)) return 'Due Soon'
  if (invoice.status === 'partially_paid') return 'Part Paid'
  return 'Outstanding'
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function isOutstanding(invoice: Invoice): boolean {
  return invoice.status !== 'draft' && invoice.status !== 'cancelled' && invoice.outstanding_paise > 0
}

function isOverdue(invoice: Invoice): boolean {
  return isOutstanding(invoice) && getDaysOverdue(invoice.due_date) > 0
}

function prettyDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function prettyTimestamp(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function rowStatus(invoice: Invoice): { label: string; className: string } {
  const label = statusLabel(invoice)
  return { label, className: `invoice-status invoice-status--${label.toLowerCase().replace(' ', '-')}` }
}

function SummaryCard({
  title,
  amount,
  subtext,
  accent,
  delta,
}: {
  title: string
  amount: number | null
  subtext: string
  accent?: 'red' | 'green'
  delta?: number | null
}) {
  const positive = delta !== undefined && delta !== null && delta >= 0
  return (
    <section className="invoice-summary-card">
      <div className="invoice-summary-title"><FileText size={13} />{title}</div>
      <div className={`invoice-summary-amount ${accent ? `is-${accent}` : ''}`}>{formatMoney(amount)}</div>
      <div className="invoice-summary-meta">
        {delta === undefined || delta === null ? <span>{subtext}</span> : (
          <span className={`invoice-summary-delta ${positive ? 'is-up' : 'is-down'}`}>
            {positive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
          </span>
        )}
      </div>
    </section>
  )
}

function EmptyTable({ message }: { message: string }) {
  return <div className="invoice-empty-state"><FileText size={22} /><span>{message}</span></div>
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="invoice-modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="invoice-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-modal-title">
        <header className="invoice-modal-heading">
          <h2 id="invoice-modal-title">{title}</h2>
          <button type="button" className="invoice-icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}

export default function InvoicesPage() {
  const [data, setData] = useState<InvoicesData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshId, setRefreshId] = useState(0)
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [search, setSearch] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [timelineState, setTimelineState] = useState<{ invoiceId: string; items: Array<{ id: string; event_type: string; created_at: string }> }>({ invoiceId: '', items: [] })
  const [documentsState, setDocumentsState] = useState<{ invoiceId: string; items: InvoiceDocument[] }>({ invoiceId: '', items: [] })
  const [upiQr, setUpiQr] = useState<{ invoiceId: string; dataUrl: string; paymentUri: string; amountPaise: number } | null>(null)
  const [form, setForm] = useState<InvoiceForm>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [draft, setDraft] = useState<InvoiceDraftInput>({
    customerId: '',
    description: '',
    amount: '',
    taxRate: '0',
    issueDate: '',
    dueDate: '',
  })
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque' | 'other'>('bank_transfer')
  const [paymentReference, setPaymentReference] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadInvoices() {
      setLoading(true)
      setLoadError(null)
      try {
        const [business, customers, invoices] = await Promise.all([
          getBusiness(),
          getAllCustomers(),
          getAllInvoices(),
        ])
        if (!cancelled) {
          setData({ business, customers, invoices })
          setSelectedId(current => current && invoices.some(invoice => invoice.id === current) ? current : invoices[0]?.id ?? '')
          setDraft(current => ({ ...current, customerId: current.customerId || customers[0]?.id || '' }))
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load invoices.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadInvoices()
    return () => { cancelled = true }
  }, [refreshId])

  useEffect(() => {
    if (!selectedId) return

    let cancelled = false
    void getInvoice(selectedId).then(invoice => {
      if (!cancelled) {
        setDetailError(null)
        setSelectedInvoice(invoice)
      }
    }).catch(error => {
      if (!cancelled) setDetailError(error instanceof Error ? error.message : 'Could not load invoice details.')
    })
    return () => { cancelled = true }
  }, [selectedId, refreshId])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void getInvoiceDocuments(selectedId).then(result => {
      if (!cancelled) setDocumentsState({ invoiceId: selectedId, items: result })
    }).catch(error => {
      if (!cancelled) setDetailError(error instanceof Error ? error.message : 'Could not load invoice documents.')
    })
    return () => { cancelled = true }
  }, [selectedId, refreshId])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void listInvoiceTimeline(selectedId).then(result => {
      if (!cancelled) setTimelineState({ invoiceId: selectedId, items: result.items })
    }).catch(error => {
      if (!cancelled) setDetailError(error instanceof Error ? error.message : 'Could not load invoice activity.')
    })
    return () => { cancelled = true }
  }, [selectedId, refreshId])

  const customersById = useMemo(
    () => new Map((data?.customers ?? []).map(customer => [customer.id, customer])),
    [data?.customers],
  )

  const totals = useMemo(() => {
    const invoices = data?.invoices ?? []
    const active = invoices.filter(invoice => invoice.status !== 'draft' && invoice.status !== 'cancelled')
    const outstanding = invoices.filter(isOutstanding)
    return {
      invoiced: active.reduce((total, invoice) => total + Number(invoice.total_paise), 0),
      outstanding: outstanding.reduce((total, invoice) => total + Number(invoice.outstanding_paise), 0),
      overdue: outstanding.filter(isOverdue).reduce((total, invoice) => total + Number(invoice.outstanding_paise), 0),
      received: active.reduce((total, invoice) => total + Number(invoice.paid_amount_paise), 0),
    }
  }, [data?.invoices])

  const visibleInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.invoices ?? []).filter(invoice => {
      const name = customersById.get(invoice.customer_id)?.name ?? ''
      const matchesSearch = !query || name.toLowerCase().includes(query) || (invoice.invoice_number ?? '').toLowerCase().includes(query)
      const matchesCustomer = !customerId || invoice.customer_id === customerId
      const matchesDates = (!fromDate || (invoice.issue_date ?? '') >= fromDate) && (!toDate || (invoice.issue_date ?? '') <= toDate)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'outstanding' && isOutstanding(invoice)) ||
        (filter === 'overdue' && isOverdue(invoice)) ||
        (filter === 'paid' && invoice.status === 'paid') ||
        (filter === 'drafts' && invoice.status === 'draft')
      return matchesSearch && matchesCustomer && matchesDates && matchesFilter
    })
  }, [data?.invoices, customersById, search, customerId, fromDate, toDate, filter])

  const pageCount = Math.max(1, Math.ceil(visibleInvoices.length / pageSize))
  const shownInvoices = visibleInvoices.slice((page - 1) * pageSize, page * pageSize)
  const tabCounts = useMemo(() => {
    const invoices = data?.invoices ?? []
    return {
      all: invoices.length,
      outstanding: invoices.filter(isOutstanding).length,
      overdue: invoices.filter(isOverdue).length,
      paid: invoices.filter(invoice => invoice.status === 'paid').length,
      drafts: invoices.filter(invoice => invoice.status === 'draft').length,
    }
  }, [data?.invoices])

  function clearFilters() {
    setSearch('')
    setCustomerId('')
    setFromDate('')
    setToDate('')
    setFilter('all')
    setPage(1)
  }

  function updateFilter(next: InvoiceFilter) {
    setFilter(next)
    setPage(1)
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.customerId) {
      setActionError('Choose an existing customer before creating an invoice.')
      return
    }
    const amountPaise = Math.round(Number(draft.amount) * 100)
    const taxRateBps = Math.round(Number(draft.taxRate || 0) * 100)
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      setActionError('Enter a valid item amount.')
      return
    }
    if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) {
      setActionError('Tax rate must be between 0 and 100 percent.')
      return
    }

    setActionBusy(true)
    setActionError(null)
    try {
      const input = {
        customerId: draft.customerId,
        ...(draft.issueDate ? { issueDate: draft.issueDate } : {}),
        ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
        items: [{
          description: draft.description.trim(),
          quantityMilli: 1000,
          unitPricePaise: amountPaise,
          taxRateBps,
        }],
      }
      const created = form === 'edit' && selectedId
        ? await updateInvoiceDraft(selectedId, input)
        : await createInvoice(input)
      setForm(null)
      setSelectedId(created.id)
      setFilter('all')
      setSearch('')
      setCustomerId('')
      setFromDate('')
      setToDate('')
      setPage(1)
      setRefreshId(value => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save the invoice draft.')
    } finally {
      setActionBusy(false)
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeInvoice || !isOutstanding(activeInvoice)) return
    const amountPaise = Math.round(Number(paymentAmount) * 100)
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      setActionError('Enter a valid payment amount.')
      return
    }
    if (amountPaise > Number(activeInvoice.outstanding_paise)) {
      setActionError('Payment amount cannot exceed the outstanding balance.')
      return
    }

    setActionBusy(true)
    setActionError(null)
    try {
      await recordPayment({
        customerId: activeInvoice.customer_id,
        amountPaise,
        method: paymentMethod,
        ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}),
        allocations: [{ invoiceId: activeInvoice.id, amountPaise }],
      })
      setForm(null)
      setPaymentAmount('')
      setPaymentReference('')
      setRefreshId(value => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not record the payment.')
    } finally {
      setActionBusy(false)
    }
  }

  async function issueSelectedInvoice() {
    if (!activeInvoice || activeInvoice.status !== 'draft') return
    setActionBusy(true)
    setActionError(null)
    try {
      await issueInvoice(activeInvoice.id)
      setRefreshId(value => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not issue the invoice.')
    } finally {
      setActionBusy(false)
    }
  }

  async function cancelSelectedInvoice() {
    if (!activeInvoice || activeInvoice.status === 'cancelled' || activeInvoice.status === 'paid') return
    const reason = window.prompt('Enter a reason for cancelling this invoice:')
    if (reason === null) return
    if (reason.trim().length < 3) {
      setActionError('Enter a cancellation reason of at least 3 characters.')
      return
    }
    setActionBusy(true)
    setActionError(null)
    try {
      await cancelInvoice(activeInvoice.id, reason.trim())
      setRefreshId(value => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not cancel the invoice.')
    } finally {
      setActionBusy(false)
    }
  }

  async function downloadSelectedInvoice() {
    if (!activeInvoice || activeInvoice.status === 'draft' || activeInvoice.status === 'cancelled') return
    setActionBusy(true)
    setActionError(null)
    try {
      const { blob, filename } = await downloadInvoicePdf(activeInvoice.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename ?? `${activeInvoice.invoice_number ?? 'invoice'}.pdf`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not download the invoice PDF.')
    } finally {
      setActionBusy(false)
    }
  }

  async function openPrintPreview() {
    if (!activeInvoice) return
    const previewWindow = window.open('', '_blank')
    if (!previewWindow) {
      setActionError('Allow pop-ups to open the invoice print preview.')
      return
    }

    setActionBusy(true)
    setActionError(null)
    try {
      previewWindow.document.write(await apiText(`/invoices/${encodeURIComponent(activeInvoice.id)}/preview`))
      previewWindow.document.close()
    } catch (error) {
      previewWindow.close()
      setActionError(error instanceof Error ? error.message : 'Could not open the invoice preview.')
    } finally {
      setActionBusy(false)
    }
  }

  async function showUpiQr() {
    if (!activeInvoice || !isOutstanding(activeInvoice)) return
    setActionBusy(true)
    setActionError(null)
    try {
      setUpiQr({ invoiceId: activeInvoice.id, ...await getInvoiceUpiQr(activeInvoice.id) })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not create the UPI payment QR.')
    } finally {
      setActionBusy(false)
    }
  }

  async function downloadDocument(documentId: string) {
    setActionBusy(true)
    setActionError(null)
    try {
      const { url } = await getInvoiceDocumentDownload(documentId)
      window.location.assign(url)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not download the invoice document.')
    } finally {
      setActionBusy(false)
    }
  }

  const activeInvoice = selectedId && selectedInvoice?.id === selectedId ? selectedInvoice : null
  const timeline = timelineState.invoiceId === selectedId ? timelineState.items : []
  const documents = documentsState.invoiceId === selectedId ? documentsState.items : []
  const visibleUpiQr = upiQr?.invoiceId === activeInvoice?.id ? upiQr : null
  const detailCustomer = activeInvoice ? customersById.get(activeInvoice.customer_id) : undefined
  const status = activeInvoice ? rowStatus(activeInvoice) : null

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="invoices" businessName={data?.business.name} />
      <main className="business-main invoices-main">
        <header className="invoices-page-heading">
          <div>
            <h1>Invoices &amp; Receivables</h1>
            <p>Manage your invoices and track payments in real-time.</p>
          </div>
          <button className="invoice-create-button" type="button" onClick={() => { setActionError(null); setForm('create') }}>
            <Plus size={15} strokeWidth={2.5} /> Create
          </button>
        </header>

        {loadError && (
          <div className="invoices-error-banner" role="alert">
            <AlertCircle size={16} /><span>{loadError}</span>
            <button type="button" onClick={() => setRefreshId(value => value + 1)}>Retry</button>
          </div>
        )}

        <div className="invoice-summary-grid">
          <SummaryCard title="Total Invoiced" amount={data ? totals.invoiced : null} subtext="Issued invoices" />
          <SummaryCard title="Outstanding Receivables" amount={data ? totals.outstanding : null} subtext="Current unpaid balance" />
          <SummaryCard title="Overdue Amount" amount={data ? totals.overdue : null} subtext={`${tabCounts.overdue} overdue invoices`} accent="red" />
          <SummaryCard title="Received" amount={data ? totals.received : null} subtext="Payments allocated" accent="green" />
        </div>

        <div className="invoice-workspace">
          <section className="invoice-list-panel" aria-label="Invoice list">
            <div className="invoice-filter-tabs" role="tablist" aria-label="Invoice status">
              {([
                ['all', 'All Invoices'],
                ['outstanding', 'Outstanding'],
                ['overdue', 'Overdue'],
                ['paid', 'Paid'],
                ['drafts', 'Drafts'],
              ] as const).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  role="tab"
                  aria-selected={filter === key}
                  className={filter === key ? 'is-selected' : ''}
                  onClick={() => updateFilter(key)}
                >
                  {label} <span>{tabCounts[key]}</span>
                </button>
              ))}
            </div>

            <div className="invoice-filter-bar">
              <label className="invoice-search">
                <Search size={15} />
                <input
                  aria-label="Search invoices"
                  placeholder="Search by customer name, invoice no..."
                  value={search}
                  onChange={event => { setSearch(event.target.value); setPage(1) }}
                />
              </label>
              <label className="invoice-customer-filter">
                <span className="sr-only">Filter by customer</span>
                <select value={customerId} onChange={event => { setCustomerId(event.target.value); setPage(1) }}>
                  <option value="">Customer</option>
                  {(data?.customers ?? []).map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
                <ChevronDown size={12} />
              </label>
              <div className="invoice-date-filter" aria-label="Filter by issue date">
                <CalendarDays size={14} />
                <label><span className="sr-only">Issue date from</span><input type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); setPage(1) }} /></label>
                <span>–</span>
                <label><span className="sr-only">Issue date to</span><input type="date" value={toDate} onChange={event => { setToDate(event.target.value); setPage(1) }} /></label>
              </div>
              <button type="button" className="invoice-clear-button" onClick={clearFilters}>Clear</button>
            </div>

            <div className="invoice-table-heading">
              <span>Invoice No.</span><span>Customer</span><span>Amount</span><span>Issue Date</span><span>Due Date</span><span>Days Due</span><span>Status</span>
            </div>
            <div className="invoice-table-body">
              {loading ? <EmptyTable message="Loading invoices…" /> : shownInvoices.length === 0 ? (
                <EmptyTable message={loadError ? 'Invoice data is unavailable.' : 'No invoices match these filters.'} />
              ) : shownInvoices.map(invoice => {
                const invoiceStatus = rowStatus(invoice)
                const daysOverdue = getDaysOverdue(invoice.due_date)
                const timing = invoice.outstanding_paise<=0
                  ? '—'
                  : invoice.status === 'draft'
                  ? '—'
                  : daysOverdue > 0
                    ? `${daysOverdue} days`
                    : invoice.due_date && invoice.due_date >= todayKey()
                      ? 'Upcoming'
                      : '—'
                return (
                  <button
                    key={invoice.id}
                    type="button"
                    className={`invoice-table-row ${selectedId === invoice.id ? 'is-selected' : ''}`}
                    onClick={() => {
                      setDetailError(null)
                      setSelectedInvoice(null)
                      setSelectedId(invoice.id)
                    }}
                    aria-pressed={selectedId === invoice.id}
                  >
                    <span className="invoice-number">{invoice.invoice_number ?? 'Draft'}</span>
                    <span className="invoice-customer-name">{customersById.get(invoice.customer_id)?.name ?? '—'}</span>
                    <span className="invoice-amount-cell">{formatMoney(invoice.total_paise)}</span>
                    <span>{prettyDate(invoice.issue_date)}</span>
                    <span>{prettyDate(invoice.due_date)}</span>
                    <span className={daysOverdue > 0 ? 'invoice-overdue-cell' : ''}>{timing}</span>
                    <span><i className={invoiceStatus.className}>{invoiceStatus.label}</i></span>
                  </button>
                )
              })}
            </div>
            <footer className="invoice-pagination">
              <span>{visibleInvoices.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, visibleInvoices.length)} of ${visibleInvoices.length}` : '0 invoices'}</span>
              <div>
                <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}><ChevronRight size={14} className="is-previous" /></button>
                <span>Page {page} of {pageCount}</span>
                <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}><ChevronRight size={14} /></button>
              </div>
            </footer>
          </section>

          <aside className="invoice-detail-panel" aria-label="Selected invoice details">
            {!activeInvoice ? (
              <EmptyTable message={loading ? 'Loading selected invoice…' : 'Select an invoice to see its details.'} />
            ) : (
              <>
                <header className="invoice-detail-header">
                  <div>
                    <h2>Invoice #{activeInvoice.invoice_number ?? 'Draft'}</h2>
                    {status && <i className={status.className}>{status.label}</i>}
                  </div>
                  <div className="invoice-detail-customer">
                    <strong>{detailCustomer?.name ?? '—'}</strong>
                    <span>{detailCustomer?.phone ?? detailCustomer?.email ?? ''}</span>
                  </div>
                </header>
                {detailError && <p className="invoice-inline-error" role="alert">{detailError}</p>}
                {actionError && <p className="invoice-inline-error" role="alert">{actionError}</p>}

                <div className="invoice-amount-banner">
                  <div><span>Invoice Amount</span><strong>{formatMoney(activeInvoice.total_paise)}</strong></div>
                  <div><span>Amount Due</span><strong>{formatMoney(activeInvoice.outstanding_paise)}</strong></div>
                </div>

                <div className="invoice-dates-grid">
                  <div><span>Issue Date</span><strong>{prettyDate(activeInvoice.issue_date)}</strong></div>
                  <div><span>Due Date</span><strong>{prettyDate(activeInvoice.due_date)}</strong></div>
                  <div><span>Overdue</span><strong className={isOverdue(activeInvoice) ? 'invoice-overdue-cell' : ''}>{isOverdue(activeInvoice) ? `${getDaysOverdue(activeInvoice.due_date)} days` : '—'}</strong></div>
                  <div><span>Received</span><strong>{formatMoney(activeInvoice.paid_amount_paise)}</strong></div>
                </div>

                <div className="invoice-detail-actions">
                  <button
                    type="button"
                    className="invoice-record-payment"
                    disabled={!isOutstanding(activeInvoice)}
                    onClick={() => {
                      setActionError(null)
                      setPaymentAmount((Number(activeInvoice.outstanding_paise) / 100).toFixed(2))
                      setForm('payment')
                    }}
                  ><Check size={14} />Record Payment</button>
                  {activeInvoice.status === 'draft' && <button type="button" disabled={actionBusy} onClick={() => void issueSelectedInvoice()}><Check size={13} />Issue Invoice</button>}
                  {activeInvoice.status === 'draft' && activeInvoice.invoice_items?.length === 1 && Number(activeInvoice.invoice_items[0].quantity) === 1 && Number(activeInvoice.invoice_items[0].discount_bps ?? 0) === 0 && <button type="button" disabled={actionBusy} onClick={() => {
                    const item = activeInvoice.invoice_items?.[0]
                    if (!item) return
                    setDraft({
                      customerId: activeInvoice.customer_id,
                      description: item.description,
                      amount: (Number(item.unit_price_paise) / 100).toFixed(2),
                      taxRate: (Number(item.tax_rate_bps ?? 0) / 100).toString(),
                      issueDate: activeInvoice.issue_date ?? '',
                      dueDate: activeInvoice.due_date ?? '',
                    })
                    setActionError(null)
                    setForm('edit')
                  }}><FileText size={13} />Edit Draft</button>}
                  {activeInvoice.status !== 'draft' && activeInvoice.status !== 'cancelled' && activeInvoice.status !== 'paid' && <button type="button" disabled={actionBusy} onClick={() => void cancelSelectedInvoice()}><X size={13} />Cancel</button>}
                  {activeInvoice.status !== 'draft' && activeInvoice.status !== 'cancelled' && isOutstanding(activeInvoice) && <button type="button" disabled={actionBusy} onClick={() => void showUpiQr()}><FileText size={13} />UPI QR</button>}
                  <button type="button" disabled={actionBusy} onClick={() => void openPrintPreview()}><FileText size={13} />Print Preview</button>
                  <button type="button" disabled={actionBusy || activeInvoice.status === 'draft' || activeInvoice.status === 'cancelled'} onClick={() => void downloadSelectedInvoice()}><Download size={13} />Download PDF</button>
                </div>
                <p className="invoice-action-note"><CircleHelp size={11} />Invoice actions use the BAAKI API. Reminder delivery is not available yet.</p>
                {visibleUpiQr && <div role="status">
                  <img src={visibleUpiQr.dataUrl} alt={`UPI payment QR for ${formatMoney(visibleUpiQr.amountPaise)}`} width={144} height={144} />
                  <p>Outstanding amount: {formatMoney(visibleUpiQr.amountPaise)}</p>
                  <a href={visibleUpiQr.paymentUri}>Open UPI payment app</a>
                  <button type="button" onClick={() => setUpiQr(null)}>Close QR</button>
                </div>}

                <section className="invoice-lines-section">
                  <h3>Invoice Details</h3>
                  <div className="invoice-line-table">
                    <div className="invoice-line-row invoice-line-heading"><span>Item</span><span>Qty</span><span>Rate</span><span>Amount</span></div>
                    {(activeInvoice.invoice_items ?? []).map(item => (
                      <div className="invoice-line-row" key={item.id ?? `${item.description}-${item.total_paise}`}>
                        <span title={item.description}>{item.description}</span>
                        <span>{currencyFormatter.format(Number(item.quantity))}</span>
                        <span>{formatMoney(item.unit_price_paise)}</span>
                        <span>{formatMoney(item.total_paise)}</span>
                      </div>
                    ))}
                    {(activeInvoice.invoice_items ?? []).length === 0 && <div className="invoice-no-lines">No line items are available.</div>}
                  </div>
                  <div className="invoice-totals">
                    <div><span>Subtotal</span><strong>{formatMoney(activeInvoice.invoice_items?.reduce((sum, item) => sum + Number(item.subtotal_paise), 0))}</strong></div>
                    <div><span>GST / tax</span><strong>{formatMoney(activeInvoice.invoice_items?.reduce((sum, item) => sum + Number(item.tax_paise), 0))}</strong></div>
                    <div className="invoice-total-row"><span>Total</span><strong>{formatMoney(activeInvoice.total_paise)}</strong></div>
                  </div>
                </section>

                <section className="invoice-activity-section">
                  <h3>Activity</h3>
                  <div className="invoice-activity-item">
                    <span className="invoice-activity-check"><Check size={12} /></span>
                    <div><strong>Invoice created</strong><span>{prettyTimestamp(activeInvoice.created_at)}</span></div>
                  </div>
                  {timeline.map(event => <div className="invoice-activity-item" key={event.id}>
                    <span className="invoice-activity-payment"><Check size={12} /></span>
                    <div><strong>{event.event_type.replaceAll('_', ' ')}</strong><span>{prettyTimestamp(event.created_at)}</span></div>
                  </div>)}
                  {!timeline.length && !detailError && <div className="invoice-no-lines">No invoice activity has been recorded.</div>}
                </section>
                <section className="invoice-activity-section">
                  <h3>Documents</h3>
                  {documents.length === 0 ? <div className="invoice-no-lines">No stored invoice documents are available.</div> : documents.map(document => (
                    <div className="invoice-activity-item" key={document.id}>
                      <span className="invoice-activity-payment"><FileText size={12} /></span>
                      <div><strong>{document.original_filename}</strong><span>{document.document_type.replaceAll('_', ' ')} · {(document.byte_size / 1024).toFixed(1)} KB · {prettyTimestamp(document.created_at)}</span></div>
                      <button type="button" disabled={actionBusy} onClick={() => void downloadDocument(document.id)}>Download</button>
                    </div>
                  ))}
                </section>
              </>
            )}
          </aside>
        </div>
      </main>

      {(form === 'create' || form === 'edit') && (
        <Modal title={form === 'edit' ? 'Edit invoice draft' : 'Create invoice draft'} onClose={() => { setForm(null); setActionError(null) }}>
          <form className="invoice-modal-form" onSubmit={submitCreate}>
            <p className="invoice-modal-description">{form === 'edit' ? 'Changes are saved to the existing draft.' : 'Creates an unissued draft in your business account.'}</p>
            <label>Customer
              <select required value={draft.customerId} onChange={event => setDraft(current => ({ ...current, customerId: event.target.value }))}>
                <option value="">Select a customer</option>
                {(data?.customers ?? []).map(customer => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <label>Item description
              <input required maxLength={500} value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} />
            </label>
            <div className="invoice-modal-grid">
              <label>Amount (₹)
                <input type="number" required min="0.01" step="0.01" value={draft.amount} onChange={event => setDraft(current => ({ ...current, amount: event.target.value }))} />
              </label>
              <label>Tax rate (%)
                <input type="number" min="0" max="100" step="0.01" value={draft.taxRate} onChange={event => setDraft(current => ({ ...current, taxRate: event.target.value }))} />
              </label>
            </div>
            <div className="invoice-modal-grid">
              <label>Issue date
                <input type="date" value={draft.issueDate} onChange={event => setDraft(current => ({ ...current, issueDate: event.target.value }))} />
              </label>
              <label>Due date
                <input type="date" value={draft.dueDate} onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))} />
              </label>
            </div>
            {actionError && <p className="invoice-modal-error" role="alert">{actionError}</p>}
            {!data?.customers.length && <p className="invoice-modal-error" role="status">Add a customer before creating an invoice.</p>}
            <div className="invoice-modal-actions">
              <button type="button" className="invoice-cancel-button" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="invoice-modal-submit" disabled={actionBusy || !data?.customers.length}>{actionBusy ? 'Saving…' : form === 'edit' ? 'Save draft' : 'Create draft'}</button>
            </div>
          </form>
        </Modal>
      )}

      {form === 'payment' && activeInvoice && (
        <Modal title="Record payment" onClose={() => { setForm(null); setActionError(null) }}>
          <form className="invoice-modal-form" onSubmit={submitPayment}>
            <p className="invoice-modal-description">Payment will be recorded and allocated to {activeInvoice.invoice_number ?? 'this invoice'}.</p>
            <label>Amount (₹)
              <input type="number" required min="0.01" max={(Number(activeInvoice.outstanding_paise) / 100).toFixed(2)} step="0.01" value={paymentAmount} onChange={event => setPaymentAmount(event.target.value)} />
            </label>
            <label>Payment method
              <select value={paymentMethod} onChange={event => {
                const value = event.target.value
                if (value === 'cash' || value === 'bank_transfer' || value === 'cheque' || value === 'other') setPaymentMethod(value)
              }}>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>Reference (optional)
              <input maxLength={200} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} />
            </label>
            {actionError && <p className="invoice-modal-error" role="alert">{actionError}</p>}
            <div className="invoice-modal-actions">
              <button type="button" className="invoice-cancel-button" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="invoice-modal-submit" disabled={actionBusy}>{actionBusy ? 'Recording…' : 'Record payment'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
