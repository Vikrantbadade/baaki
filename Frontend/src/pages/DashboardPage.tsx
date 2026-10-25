import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  TrendingDown,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import BusinessSidebar from '../components/BusinessSidebar'
import {
  getAllCustomers,
  getAllInvoices,
  getBusiness,
  getCashSnapshots,
  getLatestForecast,
  getUpcomingCashflowEntries,
  type Business,
  type CashflowEntry,
  type CashflowForecast,
  type CashSnapshot,
  type Customer,
  type Invoice,
} from '../lib/businessData'
import './DashboardPage.css'

interface DashboardData {
  business: Business
  customers: Customer[]
  invoices: Invoice[]
  snapshots: CashSnapshot[]
  forecast: CashflowForecast | null
  entries: CashflowEntry[]
}

const moneyFormat = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
})

function formatMoney(paise: number | string | null | undefined): string {
  if (paise === null || paise === undefined || paise === '') return '—'
  const amount = Number(paise)
  return Number.isFinite(amount) ? `₹${moneyFormat.format(amount / 100)}` : '—'
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function formatShortMoney(paise: number): string {
  const amount = paise / 100
  if (Math.abs(amount) >= 100000) return `₹${moneyFormat.format(amount / 100000)}L`
  if (Math.abs(amount) >= 1000) return `₹${moneyFormat.format(amount / 1000)}K`
  return `₹${moneyFormat.format(amount)}`
}

function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

const initialChartDays = Array.from({ length: 12 }, (_, index) => {
  const date = new Date()
  date.setDate(date.getDate() + index)
  return todayKey(date)
})

function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate || dueDate >= today) return 0
  return Math.floor((new Date(`${today}T00:00:00`).getTime() - new Date(`${dueDate}T00:00:00`).getTime()) / 86400000)
}

function overdueAmount(invoice: Invoice, today: string): number {
  if (!invoice.due_date || invoice.due_date >= today || invoice.outstanding_paise <= 0) return 0
  if (invoice.status === 'draft' || invoice.status === 'cancelled') return 0
  return invoice.outstanding_paise
}

function Delta({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return <span className="dashboard-delta dashboard-delta--empty">Change unavailable</span>
  const positive = inverse ? value < 0 : value >= 0
  const Icon = value < 0 ? ArrowDown : ArrowUp
  return (
    <span className={`dashboard-delta ${positive ? 'is-positive' : 'is-negative'}`}>
      <Icon size={12} />
      {formatPercent(value)}
    </span>
  )
}

function SummaryCard({
  title,
  amount,
  note,
  tag,
  delta,
  inverseDelta,
  icon,
}: {
  title: string
  amount: number | string | null | undefined
  note: string
  tag: string
  delta?: number | null
  inverseDelta?: boolean
  icon: 'cash' | 'receivable' | 'gap'
}) {
  const Icon = icon === 'cash' ? WalletIcon : icon === 'receivable' ? Clock3 : TrendingDown
  return (
    <section className="dashboard-summary-card">
      <div className="dashboard-summary-head">
        <span className="dashboard-summary-label"><Icon size={14} />{title}</span>
        <span className="dashboard-summary-tag">{tag}<ExternalLink size={10} /></span>
      </div>
      <div className="dashboard-summary-value">{formatMoney(amount)}</div>
      <div className="dashboard-summary-foot">
        <span>{note}</span>
        {delta !== undefined && <Delta value={delta} inverse={inverseDelta} />}
      </div>
    </section>
  )
}

function WalletIcon({ size = 16 }: { size?: number }) {
  return <span className="wallet-glyph" aria-hidden="true" style={{ width: size, height: size }}>▣</span>
}

function CashFlowChart({ entries }: { entries: CashflowEntry[] }) {
  const chartWidth = 690
  const chartHeight = 225
  const plotTop = 28
  const plotBottom = 188
  const mid = (plotTop + plotBottom) / 2
  const days = initialChartDays
  const values = days.map(date => {
    const matching = entries.filter(entry => entry.due_date === date)
    return {
      inflow: matching.filter(entry => entry.direction === 'inflow').reduce((sum, entry) => sum + Number(entry.amount_paise), 0),
      outflow: matching.filter(entry => entry.direction === 'outflow').reduce((sum, entry) => sum + Number(entry.amount_paise), 0),
    }
  })
  const max = Math.max(1, ...values.flatMap(value => [value.inflow, value.outflow]))
  const maxLabel = Math.ceil(max / 100000000) * 100000000 || 100000000
  const unitScale = (plotBottom - plotTop) / (2 * maxLabel)

  return (
    <section className="dashboard-panel dashboard-cashflow-panel">
      <header className="dashboard-panel-heading">
        <div className="dashboard-panel-title">
          <h2>Cash Flow Insights</h2>
          <CircleHelp size={14} aria-label="Expected cash-flow entries by due date" />
        </div>
        <div className="dashboard-legend">
          <span><i className="legend-inflow" />Inflow</span>
          <span><i className="legend-outflow" />Outflow</span>
        </div>
      </header>
      {entries.length === 0 ? (
        <div className="dashboard-chart-empty">No cash-flow entries are available for the next 12 days.</div>
      ) : (
        <svg className="dashboard-bar-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Cash inflows and outflows over the next 12 days">
          {[0, 1, 2, 3, 4].map(index => {
            const y = plotTop + (plotBottom - plotTop) * index / 4
            const value = maxLabel - maxLabel * index / 2
            return (
              <g key={index}>
                <line x1="68" y1={y} x2={chartWidth - 6} y2={y} className="dashboard-chart-grid" />
                <text x="60" y={y + 4} textAnchor="end" className="dashboard-chart-axis-label">{formatShortMoney(value)}</text>
              </g>
            )
          })}
          {values.map((value, index) => {
            const center = 91 + index * 48.3
            const inflowHeight = value.inflow * unitScale
            const outflowHeight = value.outflow * unitScale
            return (
              <g key={days[index]}>
                <rect x={center - 14} y={mid - inflowHeight} width="28" height={inflowHeight} rx="4" className="dashboard-inflow-bar">
                  <title>{`${days[index]} inflow ${formatMoney(value.inflow)}`}</title>
                </rect>
                <rect x={center - 14} y={mid} width="28" height={outflowHeight} rx="4" className="dashboard-outflow-bar">
                  <title>{`${days[index]} outflow ${formatMoney(value.outflow)}`}</title>
                </rect>
                <text x={center} y="211" textAnchor="middle" className="dashboard-chart-axis-label">{index + 1}</text>
              </g>
            )
          })}
          <text x={chartWidth - 8} y="223" textAnchor="end" className="dashboard-chart-axis-label">Days</text>
        </svg>
      )}
    </section>
  )
}

function CashRadar({ forecast }: { forecast: CashflowForecast | null }) {
  const [range, setRange] = useState(7)
  const balances = forecast?.dailyBalances.slice(0, range) ?? []
  const width = 630
  const height = 250
  const left = 44
  const right = width - 10
  const top = 28
  const bottom = height - 34
  const numbers = balances.map(day => Number(day.projectedBalancePaise))
  const min = Math.min(0, ...numbers)
  const max = Math.max(1, ...numbers)
  const yFor = (value: number) => bottom - ((value - min) / (max - min || 1)) * (bottom - top)
  const points = numbers.map((value, index) => ({
    x: left + (right - left) * index / Math.max(1, numbers.length - 1),
    y: yFor(value),
    value,
    date: balances[index].date,
  }))
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z` : ''

  return (
    <section className="dashboard-panel dashboard-radar-panel">
      <header className="dashboard-radar-heading">
        <div>
          <div className="dashboard-panel-title"><h2>Cash-Crash Radar</h2><CircleHelp size={14} /></div>
          <p>Your projected cash balance over time</p>
        </div>
        <div className="dashboard-range-control" aria-label="Forecast range">
          {[7, 30, 90, 365].map(value => (
            <button key={value} type="button" className={range === value ? 'is-selected' : ''} onClick={() => setRange(value)}>
              {value === 365 ? '1 Year' : value === 90 ? '3 Months' : `${value} Days`}
            </button>
          ))}
        </div>
      </header>
      {points.length === 0 ? (
        <div className="dashboard-chart-empty">No saved cash-flow forecast is available.</div>
      ) : (
        <svg className="dashboard-radar-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Projected daily cash balance">
          {[0, 1, 2, 3].map(index => {
            const value = max - (max - min) * index / 3
            const y = yFor(value)
            return (
              <g key={index}>
                <line x1={left} y1={y} x2={right} y2={y} className="dashboard-radar-grid" />
                <text x={left - 7} y={y + 4} textAnchor="end" className="dashboard-chart-axis-label">{formatShortMoney(value)}</text>
              </g>
            )
          })}
          <path d={areaPath} className="dashboard-radar-area" />
          <path d={linePath} className="dashboard-radar-line" />
          {points.map((point, index) => index % Math.max(1, Math.ceil(points.length / 8)) === 0 && (
            <g key={`${point.date}-${index}`}>
              <circle cx={point.x} cy={point.y} r="3" className="dashboard-radar-point" />
              <text x={point.x} y={height - 9} textAnchor="middle" className="dashboard-chart-axis-label">{new Date(`${point.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</text>
              <title>{`${point.date}: ${formatMoney(point.value)}`}</title>
            </g>
          ))}
        </svg>
      )}
    </section>
  )
}

function TopInvoices({ invoices, customers }: { invoices: Invoice[]; customers: Customer[] }) {
  const names = useMemo(() => new Map(customers.map(customer => [customer.id, customer.name])), [customers])
  const today = todayKey()
  const overdue = invoices
    .filter(invoice => overdueAmount(invoice, today) > 0 || (invoice.status !== 'draft' && invoice.status !== 'cancelled' && invoice.outstanding_paise > 0))
    .sort((a, b) => Number(b.outstanding_paise) - Number(a.outstanding_paise))
    .slice(0, 4)

  return (
    <section className="dashboard-panel dashboard-top-invoices">
      <header className="dashboard-small-panel-heading">
        <h2>Top Outstanding Invoices</h2>
        <Link to="/invoices">View all <ArrowUpRight size={12} /></Link>
      </header>
      {overdue.length === 0 ? (
        <div className="dashboard-table-empty">No overdue invoices.</div>
      ) : (
        <div className="dashboard-top-invoice-table">
          <div className="dashboard-top-invoice-row dashboard-top-invoice-header">
            <span>Customer</span><span>Invoice No.</span><span>Amount</span><span>Days Overdue</span><span>Status</span>
          </div>
          {overdue.map(invoice => (
            <Link to="/invoices" key={invoice.id} className="dashboard-top-invoice-row">
              <span title={names.get(invoice.customer_id) ?? 'Customer'}>{names.get(invoice.customer_id) ?? '—'}</span>
              <span className="dashboard-link-text">{invoice.invoice_number ?? 'Draft'}</span>
              <span>{formatMoney(invoice.outstanding_paise)}</span>
              <span className="dashboard-overdue-text">{daysOverdue(invoice.due_date, today) > 0 ? `${daysOverdue(invoice.due_date, today)} days` : '—'}</span>
              <span><i className="dashboard-status-dot" />{daysOverdue(invoice.due_date,today)>0?'Overdue':invoice.due_date===today?'Due today':'Outstanding'}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadDashboard() {
      setLoading(true)
      setError(null)
      try {
        const [business, invoices, customers, snapshots, forecast, entries] = await Promise.all([
          getBusiness(),
          getAllInvoices(),
          getAllCustomers(),
          getCashSnapshots(),
          getLatestForecast(),
          getUpcomingCashflowEntries(),
        ])
        if (!cancelled) setData({ business, invoices, customers, snapshots: snapshots.items, forecast, entries })
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load dashboard data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadDashboard()
    return () => { cancelled = true }
  }, [reloadToken])

  const outstanding = data?.invoices
    .filter(invoice => invoice.status !== 'draft' && invoice.status !== 'cancelled')
    .reduce((sum, invoice) => sum + Number(invoice.outstanding_paise), 0)
  const snapshotDelta = data?.snapshots.length && data.snapshots.length > 1
    ? Number(data.snapshots[0].amount_paise) - Number(data.snapshots[1].amount_paise)
    : null
  const cashDeltaPercent = data?.snapshots.length && data.snapshots.length > 1 && Number(data.snapshots[1].amount_paise) !== 0
    ? snapshotDelta! / Number(data.snapshots[1].amount_paise) * 100
    : null
  const balanceDays = data?.forecast?.dailyBalances ?? []

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="dashboard" businessName={data?.business.name} />
      <main className="business-main dashboard-main">
        <div className="dashboard-top-grid">
          <div className="dashboard-summary-column">
            <SummaryCard
              title="Available Cash"
              amount={data?.snapshots[0]?.amount_paise}
              note={data?.snapshots[0] ? `As of ${new Date(data.snapshots[0].recorded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'No cash snapshot'}
              tag="Cash Flow"
              delta={cashDeltaPercent}
              icon="cash"
            />
            <SummaryCard
              title="Outstanding Receivables"
              amount={outstanding}
              note={data ? `${data.invoices.filter(invoice => invoice.outstanding_paise > 0).length} open invoices` : 'Current invoice balance'}
              tag="Receivables"
              icon="receivable"
            />
            <SummaryCard
              title="Cash Gap"
              amount={data?.forecast?.cashGapPaise ?? null}
              note={data?.forecast?.shortageDate ? `Reserve gap from ${new Date(`${data.forecast.shortageDate}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone:'UTC' })}` : 'No forecast gap'}
              tag="Forecast"
              icon="gap"
            />
          </div>
          <CashFlowChart entries={data?.entries ?? []} />
        </div>

        {loading && <div className="dashboard-load-state" role="status">Loading business data…</div>}
        {error && (
          <div className="dashboard-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setReloadToken(value => value + 1)}>Retry</button>
          </div>
        )}
        <div className="dashboard-bottom-grid">
          <CashRadar forecast={data?.forecast ?? null} />
          <TopInvoices invoices={data?.invoices ?? []} customers={data?.customers ?? []} />
        </div>
        {data && balanceDays.length === 0 && !error && <span className="sr-only">No forecast values are available.</span>}
      </main>
    </div>
  )
}
