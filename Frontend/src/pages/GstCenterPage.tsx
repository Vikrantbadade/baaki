import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, FileText, Info } from 'lucide-react'
import BusinessSidebar from '../components/BusinessSidebar'
import {
  getAllCustomers,
  getAllInvoices,
  getBusiness,
  getInvoice,
  type Business,
  type Customer,
  type Invoice,
} from '../lib/businessData'
import './FinancialPages.css'

type GstFilter = 'all' | 'sales' | 'purchases' | 'missing'

interface GstData {
  business: Business
  customers: Customer[]
  invoices: Invoice[]
}

const amountFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const currentPeriod = currentMonthKey()
const currentPeriodOption = {
  value: currentPeriod,
  label: new Date(`${currentPeriod}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
}

function formatMoney(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(Number(paise))) return '—'
  return `₹${amountFormatter.format(Number(paise) / 100)}`
}

function prettyDate(date: string | null): string {
  if (!date) return '—'
  const value = new Date(`${date.slice(0, 10)}T00:00:00`)
  return Number.isNaN(value.getTime()) ? '—' : value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7)
}

export default function GstCenterPage() {
  const [data, setData] = useState<GstData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [filter, setFilter] = useState<GstFilter>('all')
  const [period, setPeriod] = useState(currentMonthKey)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState<Invoice | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadGst() {
      setLoading(true)
      setError(null)
      try {
        const [business, customers, invoices] = await Promise.all([getBusiness(), getAllCustomers(), getAllInvoices()])
        if (!cancelled) {
          setData({ business, customers, invoices })
          setSelectedId(current => current && invoices.some(invoice => invoice.id === current) ? current : invoices[0]?.id ?? '')
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load invoice records.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadGst()
    return () => { cancelled = true }
  }, [retry])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void getInvoice(selectedId).then(invoice => {
      if (!cancelled) {
        setDetail(invoice)
        setDetailError(null)
      }
    }).catch(reason => {
      if (!cancelled) setDetailError(reason instanceof Error ? reason.message : 'Could not load invoice details.')
    })
    return () => { cancelled = true }
  }, [selectedId, retry])

  const customerById = useMemo(() => new Map((data?.customers ?? []).map(customer => [customer.id, customer])), [data?.customers])
  const filteredInvoices = useMemo(() => (data?.invoices ?? []).filter(invoice => {
    const customer = customerById.get(invoice.customer_id)
    const issueMonth = invoice.issue_date?.slice(0, 7)
    const matchesPeriod = period === 'all' || issueMonth === period
    const missingGstin = !customer?.tax_id
    return !['draft', 'cancelled'].includes(invoice.status) && matchesPeriod && ((filter==='all'||filter==='sales')||(filter==='missing'&&missingGstin))
  }), [data?.invoices, customerById, filter, period])

  const detailTotals = detail?.invoice_items?.reduce((totals, item) => ({
    taxable: totals.taxable + Number(item.subtotal_paise),
    tax: totals.tax + Number(item.tax_paise),
  }), { taxable: 0, tax: 0 })
  const outputTax=detailTotals?.tax ?? null

  const periods = [{ value: 'all', label: 'All periods' }, currentPeriodOption]

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="gst" businessName={data?.business.name} />
      <main className="business-main financial-page gst-page">
        <header className="financial-page-heading">
          <div><h1>GST Center</h1><p>Review invoice tax details and keep your filing records ready.</p></div>
          <label className="financial-select"><CalendarDays size={15} /><span className="sr-only">GST period</span>
            <select value={period} onChange={event => setPeriod(event.target.value)}>{periods.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
          </label>
        </header>
        {error && <div className="financial-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
        <div className="gst-kpi-grid">
          <GstMetric title="Selected invoice tax" value={formatMoney(outputTax)} context="Stored invoice-line tax; not GST validation" />
          <GstMetric title="Input Tax Credit (ITC)" value="—" context="Purchase records API is not implemented" />
          <GstMetric title="Net GST liability" value="—" context="Not calculated without verified purchase and filing data" />
          <GstMetric title="Records to Review" value="—" context="GST portal reconciliation is unavailable" />
        </div>

        <section className="financial-panel gst-invoice-panel">
          <header className="gst-panel-heading"><div><h2>Invoice tax details</h2><span>Issued invoice records from the BAAKI API · not reconciled with the GST portal.</span></div><button type="button" className="financial-text-button" onClick={()=>{setPeriod('all');setFilter('all')}}>View all →</button></header>
          <div className="gst-tabs" role="tablist" aria-label="GST invoice category">
            {([
              ['all', 'All'],
              ['sales', 'Sales (Outward)'],
              ['purchases', 'Purchases (Inward)'],
              ['missing', 'Missing Details'],
            ] as const).map(([key, label]) => <button type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'is-selected' : ''} key={key} onClick={() => setFilter(key)}>{label}</button>)}
          </div>
          <div className="gst-table-head"><span>Date</span><span>Invoice No.</span><span>Type</span><span>Counterparty</span><span>Taxable Value</span><span>GST Amount</span><span>Status</span><span /></div>
          <div className="gst-table-body">
            {loading ? <div className="financial-empty-state">Loading invoice records…</div> : filter === 'purchases' ? <div className="financial-empty-state">Purchase invoices are unavailable because no purchase-record endpoint is implemented.</div> : filteredInvoices.length === 0 ? (
              <div className="financial-empty-state">{error ? 'Invoice records are unavailable.' : 'No invoice records match this period.'}</div>
            ) : filteredInvoices.map(invoice => {
              const customer = customerById.get(invoice.customer_id)
              const missingTaxId = !customer?.tax_id
              return <button type="button" key={invoice.id} className={`gst-table-row ${selectedId === invoice.id ? 'is-selected' : ''}`} aria-pressed={selectedId === invoice.id} onClick={() => {setDetail(null);setDetailError(null);setSelectedId(invoice.id)}}>
                <span>{prettyDate(invoice.issue_date)}</span><span className="gst-invoice-number">{invoice.invoice_number ?? 'Draft'}</span><span><i className="gst-type-label">Sales</i></span>
                <span title={customer?.name ?? ''}>{customer?.name ?? '—'}<small>{customer?.tax_id ?? 'GSTIN not recorded'}</small></span><span>Open details</span><span>Open details</span>
                <span><i className={`gst-status-label ${missingTaxId ? 'is-review' : 'is-recorded'}`}>{missingTaxId ? 'GSTIN missing' : 'Recorded'}</i></span><span><ChevronRight size={15} /></span>
              </button>
            })}
          </div>
        </section>

        <div className="gst-bottom-grid">
          <section className="financial-panel gst-selected-record">
            <header className="financial-small-heading"><h2>Selected invoice details</h2><FileText size={15} /></header>
            {!selectedId ? <p className="gst-detail-placeholder">Select an invoice to review its stored tax details.</p> : detailError ? <p className="financial-inline-error" role="alert">{detailError}</p> : !detail ? <p className="gst-detail-placeholder">Loading selected invoice details…</p> : (
              <div className="gst-detail-content">
                <strong>Invoice {detail.invoice_number ?? 'Draft'}</strong>
                <span>{customerById.get(detail.customer_id)?.name ?? '—'} · GSTIN {customerById.get(detail.customer_id)?.tax_id ?? 'not recorded'} · issued {prettyDate(detail.issue_date)}</span>
                <div><span>Taxable value</span><b>{formatMoney(detailTotals?.taxable ?? 0)}</b></div>
                <div><span>Tax on invoice line items</span><b>{formatMoney(detailTotals?.tax ?? 0)}</b></div>
                <small>Invoice-line data only; this is not a GST reconciliation or return calculation.</small>
              </div>
            )}
          </section>
          <section className="financial-panel gst-filing-panel">
            <div><CalendarDays size={22} /><div><strong>GST filing support unavailable</strong><span>Filing dates, purchase records, and return submission are not connected.</span></div></div>
            <div><strong>Return preparation</strong><span>Use verified tax records and the GST portal; Baaki has no filing endpoint yet.</span></div>
          </section>
        </div>
        {!data && !loading && !error && <p className="sr-only">GST records are unavailable.</p>}
      </main>
    </div>
  )
}

function GstMetric({ title, value, context }: { title: string; value: string; context: string }) {
  return <section className="gst-metric-card"><span>{title}<Info size={12} /></span><strong>{value}</strong><small>{context}</small></section>
}
