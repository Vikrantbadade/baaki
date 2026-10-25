import { useEffect, useMemo, useState } from 'react'
import { CircleHelp, Info } from 'lucide-react'
import BusinessSidebar from '../components/BusinessSidebar'
import {
  getAllCustomers,
  getAllInvoices,
  getBusiness,
  type Business,
  type Customer,
  type Invoice,
} from '../lib/businessData'
import './FinancialPages.css'

interface RecoveryData {
  business: Business
  invoices: Invoice[]
  customers: Customer[]
}

const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const todayKey = new Date().toISOString().slice(0, 10)
const dueSoonKey = (() => {
  const date = new Date(`${todayKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 30)
  return date.toISOString().slice(0,10)
})()

function formatMoney(paise: number): string {
  return `₹${currency.format(paise / 100)}`
}

function isOpen(invoice: Invoice): boolean {
  return invoice.status !== 'draft' && invoice.status !== 'cancelled' && Number(invoice.outstanding_paise) > 0
}

export default function RecoveryCopilotPage() {
  const [data, setData] = useState<RecoveryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadReceivables() {
      setLoading(true)
      setError(null)
      try {
        const [business, invoices, customers] = await Promise.all([getBusiness(), getAllInvoices(), getAllCustomers()])
        if (!cancelled) setData({ business, invoices, customers })
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load receivables.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadReceivables()
    return () => { cancelled = true }
  }, [retry])

  const summary = useMemo(() => {
    const open = (data?.invoices ?? []).filter(isOpen)
    return {
      total: open.reduce((sum, invoice) => sum + Number(invoice.outstanding_paise), 0),
      overdue: open.filter(invoice => invoice.due_date && invoice.due_date < todayKey)
        .reduce((sum, invoice) => sum + Number(invoice.outstanding_paise), 0),
      dueSoon: open.filter(invoice => invoice.due_date && invoice.due_date >= todayKey && invoice.due_date <= dueSoonKey)
        .reduce((sum, invoice) => sum + Number(invoice.outstanding_paise), 0),
      notYetDue: open.filter(invoice => invoice.due_date && invoice.due_date > dueSoonKey)
        .reduce((sum, invoice) => sum + Number(invoice.outstanding_paise), 0),
    }
  }, [data?.invoices])
  const receivableParts = summary.total > 0
    ? {
        overdue: `${summary.overdue / summary.total * 100}%`,
        dueSoon: `${summary.dueSoon / summary.total * 100}%`,
        notYetDue: `${summary.notYetDue / summary.total * 100}%`,
      }
    : { overdue: '0%', dueSoon: '0%', notYetDue: '0%' }
  const topCustomers = useMemo(() => {
    const totals = new Map<string, number>()
    for (const invoice of data?.invoices ?? []) {
      if (isOpen(invoice)) totals.set(invoice.customer_id, (totals.get(invoice.customer_id) ?? 0) + Number(invoice.outstanding_paise))
    }
    return [...totals.entries()]
      .map(([customerId, amount]) => ({
        customer: data?.customers.find(item => item.id === customerId),
        amount,
      }))
      .filter((item): item is { customer: Customer; amount: number } => item.customer !== undefined)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [data])

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="recovery" businessName={data?.business.name} />
      <main className="business-main financial-page recovery-page">
        <header className="financial-page-heading">
          <div><h1>Recovery Copilot</h1><p>Review outstanding customer balances and supported collection features.</p></div>
          <span className="financial-outline-button"><CircleHelp size={15} />Receivables overview</span>
        </header>
        <div className="financial-info-banner" role="status"><Info size={15} />Collection-strategy recommendations and reminder delivery are unavailable; this page shows only server-backed receivable balances.</div>
        {error && <div className="financial-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}

        <div className="recovery-top-grid">
          <section className="financial-panel recovery-goal-panel">
            <div className="recovery-step-title"><span>!</span><div><h2>Collection strategy unavailable</h2><p>The backend does not expose a verified strategy or recommendation contract.</p></div></div>
            <p className="recovery-unavailable-note" role="status">No generated recommendations are shown and no customer contact is initiated.</p>
          </section>

          <section className="financial-panel recovery-receivables-panel">
            <header className="financial-small-heading"><h2>Current Receivables</h2><CircleHelp size={14} aria-label="Derived from outstanding issued invoices" /></header>
            <p className="recovery-outstanding-label">Total Outstanding</p>
            <strong className="recovery-total">{loading ? 'Loading…' : data ? formatMoney(summary.total) : '—'}</strong>
            <div className="recovery-receivable-bar" aria-hidden="true">
              <span className="is-overdue" style={{ width: receivableParts.overdue }} />
              <span className="is-soon" style={{ width: receivableParts.dueSoon }} />
              <span className="is-later" style={{ width: receivableParts.notYetDue }} />
            </div>
            <ReceivableLine color="red" label="Overdue" value={loading ? '—' : data ? formatMoney(summary.overdue) : '—'} />
            <ReceivableLine color="amber" label="Due in 1–30 days" value={loading ? '—' : data ? formatMoney(summary.dueSoon) : '—'} />
            <ReceivableLine color="green" label="Not yet due (>30 days)" value={loading ? '—' : data ? formatMoney(summary.notYetDue) : '—'} />
            {error && <p className="recovery-data-note">Receivables could not be loaded.</p>}
          </section>
        </div>

        <section className="financial-panel recovery-plans-panel">
          <div className="recovery-step-title"><span>1</span><div><h2>Largest outstanding customer balances</h2><p>Calculated from active invoice balances returned by the backend; these are not collection recommendations.</p></div></div>
          {loading ? <div className="financial-empty-state">Loading receivables…</div> : topCustomers.length === 0 ? <div className="financial-empty-state">No outstanding customer balances.</div> : topCustomers.map(({ customer, amount }) => (
            <div className="recovery-allocation" key={customer.id}><span>{customer.name}<small>{customer.email ?? customer.phone ?? 'No contact details'}</small></span><strong>{formatMoney(amount)}</strong></div>
          ))}
        </section>
      </main>
    </div>
  )
}

function ReceivableLine({ color, label, value }: { color: 'red' | 'amber' | 'green'; label: string; value: string }) {
  return <div className="recovery-receivable-line"><span><i className={`recovery-dot ${color}`} />{label}</span><strong>{value}</strong></div>
}
