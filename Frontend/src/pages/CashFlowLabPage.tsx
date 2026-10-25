import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  CircleHelp,
  Wallet,
} from 'lucide-react'
import BusinessSidebar from '../components/BusinessSidebar'
import {
  getBusiness,
  getCashflowEntries,
  getLatestForecast,
  getCashSnapshots,
  createCashflowForecast,
  createCashflowEntry,
  deleteCashflowEntry,
  recordCashSnapshot,
  type Business,
  type CashflowEntry,
  type CashflowForecast,
  type CashSnapshot,
} from '../lib/businessData'
import './FinancialPages.css'

type EntryFilter = 'all' | 'inflow' | 'outflow'

interface LabData {
  business: Business
  forecast: CashflowForecast | null
  snapshots: CashSnapshot[]
  entries: CashflowEntry[]
}

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const todayDate = new Date()

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const todayKey = dateKey(todayDate)

function formatMoney(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || !Number.isFinite(Number(paise))) return '—'
  return `₹${money.format(Number(paise) / 100)}`
}

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export default function CashFlowLabPage() {
  const [range, setRange] = useState(30)
  const [filter, setFilter] = useState<EntryFilter>('all')
  const [data, setData] = useState<LabData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [viewAll, setViewAll] = useState(false)
  const [cashAmount, setCashAmount] = useState('')
  const [savingMutation, setSavingMutation] = useState(false)
  const [forecastBusy, setForecastBusy] = useState(false)
  const [entryFormOpen, setEntryFormOpen] = useState(false)
  const [entryDirection, setEntryDirection] = useState<'inflow' | 'outflow'>('inflow')
  const [entryAmount, setEntryAmount] = useState('')
  const [entryDate, setEntryDate] = useState(todayKey)
  const [entryCategory, setEntryCategory] = useState('')
  const [entryDescription, setEntryDescription] = useState('')
  const [entryIsActual, setEntryIsActual] = useState(false)

  async function saveSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amountPaise = Math.round(Number(cashAmount) * 100)
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
      setError('Enter a valid cash balance in rupees.')
      return
    }
    setSavingMutation(true)
    setError(null)
    try {
      await recordCashSnapshot(amountPaise)
      setCashAmount('')
      setRetry(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not record the cash snapshot.')
    } finally {
      setSavingMutation(false)
    }
  }

  async function refreshForecast() {
    setForecastBusy(true)
    setError(null)
    try {
      await createCashflowForecast(range)
      setRetry(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not calculate the forecast.')
    } finally {
      setForecastBusy(false)
    }
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amountPaise = Math.round(Number(entryAmount) * 100)
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      setError('Enter a valid cash movement amount.')
      return
    }
    setSavingMutation(true)
    setError(null)
    try {
      await createCashflowEntry({
        direction: entryDirection,
        amountPaise,
        dueDate: entryDate,
        category: entryCategory.trim(),
        ...(entryDescription.trim() ? { description: entryDescription.trim() } : {}),
        isActual: entryIsActual,
      })
      setEntryFormOpen(false)
      setEntryAmount('')
      setEntryCategory('')
      setEntryDescription('')
      setRetry(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the cash movement.')
    } finally {
      setSavingMutation(false)
    }
  }

  async function removeEntry(entryId: string) {
    if (!window.confirm('Delete this cash-flow entry?')) return
    setError(null)
    try {
      await deleteCashflowEntry(entryId)
      setRetry(value => value + 1)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the cash-flow entry.')
    }
  }

  useEffect(() => {
    let cancelled = false
    async function loadLab() {
      setLoading(true)
      setError(null)
      const from = dateKey(todayDate)
      const toDate = new Date(todayDate)
      toDate.setDate(toDate.getDate() + range - 1)
      try {
        const [business, forecast, snapshots, entries] = await Promise.all([
          getBusiness(),
          getLatestForecast(),
          getCashSnapshots(),
          getCashflowEntries(from, dateKey(toDate)),
        ])
        if (!cancelled) setData({ business, forecast, snapshots: snapshots.items, entries })
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load cash-flow data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadLab()
    return () => { cancelled = true }
  }, [range, retry])

  const balances = data?.forecast?.dailyBalances.slice(0, range) ?? []
  const forecastInflows = balances.reduce((sum, day) => sum + Number(day.actualInflowPaise) + Number(day.estimatedInflowPaise), 0)
  const forecastOutflows = balances.reduce((sum, day) => sum + Number(day.actualOutflowPaise) + Number(day.estimatedOutflowPaise), 0)
  const openingBalance = data?.forecast?.startingBalancePaise ?? data?.snapshots[0]?.amount_paise ?? null
  const closingBalance = balances.length ? Number(balances[balances.length - 1].projectedBalancePaise) : null
  const maxBalance = balances.length ? Math.max(...balances.map(day => Number(day.projectedBalancePaise))) : null
  const minBalance = balances.length ? Math.min(...balances.map(day => Number(day.projectedBalancePaise))) : null
  const daysBelowZero=balances.filter(day=>Number(day.projectedBalancePaise)<0).length
  const entries = data?.entries ?? []
  const filteredEntries = filter === 'all' ? entries : entries.filter(entry => entry.direction === filter)
  const selectedEntries = viewAll ? filteredEntries : filteredEntries.slice(0, 5)

  const chart = (() => {
    if (!balances.length) return null
    const width = 900
    const height = 220
    const left = 55
    const right = width - 8
    const top = 18
    const bottom = height - 30
    const values = balances.map(day => Number(day.projectedBalancePaise))
    const min = Math.min(...values,0)
    const max = Math.max(...values)
    const y = (value: number) => bottom - ((value - min) / (max - min || 1)) * (bottom - top)
    const points = values.map((value, index) => ({
      x: left + (right - left) * index / Math.max(1, values.length - 1),
      y: y(value),
      date: balances[index].date,
      value,
    }))
    return {
      width,
      height,
      points,
      line: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
      area: `M ${points[0].x} ${bottom} ${points.map(point => `L ${point.x} ${point.y}`).join(' ')} L ${points[points.length - 1].x} ${bottom} Z`,
      min,
      max,
    }
  })()

  const categories = (() => {
    const group = (direction: 'inflow' | 'outflow'): [string, number][] => {
      const totals = new Map<string, number>()
      for (const entry of entries) {
        if (entry.due_date > todayKey && entry.direction === direction) totals.set(entry.category, (totals.get(entry.category) ?? 0) + Number(entry.amount_paise))
      }
      return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    }
    return { inflows: group('inflow'), outflows: group('outflow') }
  })()

  const rangeOptions = [7, 30, 90, 365]

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="cashflow-lab" businessName={data?.business.name} />
      <main className="business-main financial-page cashflow-page">
        <header className="financial-page-heading">
          <div><h1>Cash Flow Lab</h1><p>Track where your money moves and plan ahead.</p></div>
          <div>
            <label className="financial-select"><CalendarDays size={15} /><span className="sr-only">Forecast period</span>
              <select value={range} onChange={event => setRange(Number(event.target.value))}>
                {rangeOptions.map(days => <option value={days} key={days}>{days === 365 ? 'Next year' : `Next ${days} days`}</option>)}
              </select>
            </label>
            <form onSubmit={saveSnapshot}>
              <label>Current cash balance (₹)<input type="number" min="0" step="0.01" value={cashAmount} onChange={event => setCashAmount(event.target.value)} required /></label>
              <button type="submit" disabled={savingMutation}>{savingMutation ? 'Recording…' : 'Record balance'}</button>
            </form>
            <button type="button" onClick={() => void refreshForecast()} disabled={forecastBusy}>{forecastBusy ? 'Calculating…' : 'Recalculate forecast'}</button>
          </div>
        </header>

        {error && <div className="financial-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}

        <div className="cashflow-kpi-grid">
          <KpiCard icon="balance" label="Opening Balance" value={formatMoney(openingBalance)} context={data?.snapshots[0] ? `Snapshot ${formatDate(data.snapshots[0].recorded_at)}` : 'Forecast starting balance'} />
          <KpiCard icon="inflow" label="Expected Inflows" value={data?.forecast ? formatMoney(forecastInflows) : '—'} context={`Forecast period · ${balances.length} days`} />
          <KpiCard icon="outflow" label="Expected Outflows" value={data?.forecast ? formatMoney(forecastOutflows) : '—'} context={`Forecast period · ${balances.length} days`} />
          <KpiCard icon="balance" label="Projected Closing Balance" value={formatMoney(closingBalance)} context={balances.length ? `As of ${formatDate(balances[balances.length - 1].date)}` : 'No forecast balance'} />
        </div>

        <section className="financial-panel cashflow-forecast-panel">
          <header className="cashflow-forecast-heading">
            <div className="financial-section-heading"><h2>Cash Balance Forecast</h2><CircleHelp size={14} aria-label="Latest saved forecast from the BAAKI API" /></div>
            <div className="cashflow-legend"><span><i className="cashflow-legend-balance" />Projected balance</span><span><i className="cashflow-legend-inflow" />Inflow</span><span><i className="cashflow-legend-outflow" />Outflow</span>
              <div className="cashflow-range-control" aria-label="Forecast chart range">
                {rangeOptions.map(days => <button type="button" key={days} className={range === days ? 'is-selected' : ''} onClick={() => setRange(days)}>{days === 365 ? '1 Year' : `${days} Days`}</button>)}
              </div>
            </div>
          </header>
          {loading ? <div className="financial-empty-state">Loading saved forecast…</div> : !data?.forecast || !chart ? (
            <div className="financial-empty-state">{error ? 'Forecast data is unavailable.' : 'No saved cash-balance forecast is available.'}</div>
          ) : (
            <svg className="cashflow-balance-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="Projected cash balance forecast">
              {[0, 1, 2, 3].map(index => {
                const y = 18 + (172 * index / 3)
                const value = chart.max - ((chart.max - chart.min) * index / 3)
                return <g key={index}><line x1="55" y1={y} x2="892" y2={y} className="financial-chart-grid" /><text x="48" y={y + 4} textAnchor="end">{formatMoney(value)}</text></g>
              })}
              <path d={chart.area} className="cashflow-chart-area" />
              <line x1="55" y1={18+(chart.max)/(chart.max-chart.min||1)*172} x2="892" y2={18+(chart.max)/(chart.max-chart.min||1)*172} className="cashflow-reserve-line"><title>Zero balance</title></line>
              <path d={chart.line} className="cashflow-chart-line" />
              {chart.points.filter((_, index) => index % Math.max(1, Math.ceil(chart.points.length / 8)) === 0).map((point,index) => (
                <g key={`${point.date}-${index}`}><circle cx={point.x} cy={point.y} r="3"><title>{`${point.date} · projected balance ${formatMoney(point.value)}`}</title></circle><text x={point.x} y="210" textAnchor="middle">{formatDate(point.date)}</text></g>
              ))}
            </svg>
          )}
        </section>

        <div className="cashflow-bottom-grid">
          <section className="financial-panel cashflow-movements">
            <header className="financial-small-heading"><h2>Upcoming Cash Movements</h2><div><button type="button" className="financial-text-button" onClick={() => setEntryFormOpen(value => !value)}>{entryFormOpen ? 'Close' : 'Add movement'}</button><button type="button" className="financial-text-button" onClick={() => setViewAll(value => !value)}>{viewAll ? 'Show less' : 'View all'} →</button></div></header>
            {entryFormOpen && <form className="invoice-modal-form" onSubmit={saveEntry}>
              <label>Direction<select value={entryDirection} onChange={event => setEntryDirection(event.target.value === 'outflow' ? 'outflow' : 'inflow')}><option value="inflow">Inflow</option><option value="outflow">Outflow</option></select></label>
              <label>Amount (₹)<input type="number" min="0.01" step="0.01" value={entryAmount} onChange={event => setEntryAmount(event.target.value)} required /></label>
              <label>Due date<input type="date" min={todayKey} value={entryDate} onChange={event => setEntryDate(event.target.value)} required /></label>
              <label>Category<input maxLength={100} value={entryCategory} onChange={event => setEntryCategory(event.target.value)} required /></label>
              <label>Description<input maxLength={500} value={entryDescription} onChange={event => setEntryDescription(event.target.value)} /></label>
              <label><input type="checkbox" checked={entryIsActual} onChange={event => setEntryIsActual(event.target.checked)} />Already occurred</label>
              <button type="submit" className="financial-primary-button" disabled={savingMutation}>{savingMutation ? 'Saving…' : 'Save movement'}</button>
            </form>}
            <div className="cashflow-entry-tabs" role="tablist" aria-label="Cash movement filter">
              {(['all', 'inflow', 'outflow'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'is-selected' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'inflow' ? 'Inflows' : 'Outflows'}</button>)}
            </div>
            <div className="cashflow-entry-head"><span>Date</span><span>Description</span><span>Category</span><span>Amount</span><span>Status</span></div>
            {loading ? <div className="financial-empty-state">Loading entries…</div> : selectedEntries.length === 0 ? (
              <div className="financial-empty-state">{error ? 'Movement data is unavailable.' : 'No cash movements in this forecast period.'}</div>
            ) : selectedEntries.map(entry => (
              <div className="cashflow-entry-row" key={entry.id}>
                <span>{formatDate(entry.due_date)}</span><span title={entry.description ?? ''}>{entry.description || '—'}</span><span>{entry.category}</span>
                <strong className={entry.direction === 'inflow' ? 'is-inflow' : 'is-outflow'}>{entry.direction === 'inflow' ? '+' : '−'}{formatMoney(entry.amount_paise)}</strong>
                <i className={`cashflow-entry-status ${entry.is_actual ? 'is-actual' : 'is-expected'}`}>{entry.is_actual ? 'Actual' : 'Expected'}</i>
                <button type="button" onClick={() => void removeEntry(entry.id)}>Delete</button>
              </div>
            ))}
          </section>

          <section className="financial-panel cashflow-breakdown">
            <header className="financial-small-heading"><h2>Inflows vs Outflows</h2><CircleHelp size={14} aria-label="Forecast totals and cash-entry categories" /></header>
            <Breakdown direction="inflow" total={data?.forecast ? formatMoney(forecastInflows) : '—'} totalPaise={data?.forecast ? forecastInflows : null} categories={categories.inflows} />
            <Breakdown direction="outflow" total={data?.forecast ? formatMoney(forecastOutflows) : '—'} totalPaise={data?.forecast ? forecastOutflows : null} categories={categories.outflows} />
          </section>

          <section className="financial-panel cashflow-position">
            <header className="financial-small-heading"><h2>Cash Position Summary</h2><CircleHelp size={14} aria-label="Summary of saved projected balances" /></header>
            <Position label="Highest projected balance" amount={formatMoney(maxBalance)} date={balances.length ? formatDate(balances.reduce((a, b) => Number(a.projectedBalancePaise) > Number(b.projectedBalancePaise) ? a : b).date) : '—'} />
            <Position label="Lowest projected balance" amount={formatMoney(minBalance)} date={balances.length ? formatDate(balances.reduce((a, b) => Number(a.projectedBalancePaise) < Number(b.projectedBalancePaise) ? a : b).date) : '—'} danger />
            <Position label="Days below zero" amount={`${daysBelowZero} days`} date="Based on the saved forecast" />
            <Position label="Projected closing balance" amount={formatMoney(closingBalance)} date={balances.length ? formatDate(balances[balances.length - 1].date) : '—'} />
          </section>
        </div>
      </main>
    </div>
  )
}

function KpiCard({ icon, label, value, context }: { icon: 'balance' | 'inflow' | 'outflow'; label: string; value: string; context: string }) {
  const Icon = icon === 'balance' ? Wallet : icon === 'inflow' ? ArrowDownToLine : ArrowUpFromLine
  return <section className="cashflow-kpi-card"><div className="cashflow-kpi-label"><Icon size={17} />{label}</div><strong>{value}</strong><span>{context}</span></section>
}

function Breakdown({ direction, total, totalPaise, categories }: { direction: 'inflow' | 'outflow'; total: string; totalPaise: number | null; categories: [string, number][] }) {
  const categoryTotal = categories.reduce((sum, [, amount]) => sum + amount, 0)
  const share = totalPaise && totalPaise > 0 ? Math.min(100, categoryTotal / totalPaise * 100) : 0
  return (
    <div className="cashflow-breakdown-section">
      <div className="cashflow-breakdown-total"><span>Total {direction === 'inflow' ? 'Inflows' : 'Outflows'}</span><strong>{total}</strong></div>
      <div className={`cashflow-breakdown-bar ${direction}`}><span style={{ width: `${share}%` }} /></div>
      {categories.length === 0 ? <p className="cashflow-category-empty">No categorized entries in this period.</p> : categories.map(([category, amount]) => (
        <div className="cashflow-category-row" key={category}><span><i className={`cashflow-category-dot ${direction}`} />{category}</span><strong>{formatMoney(amount)}</strong></div>
      ))}
    </div>
  )
}

function Position({ label, amount, date, danger = false }: { label: string; amount: string; date: string; danger?: boolean }) {
  return <div className="cashflow-position-row"><span>{label}</span><div><strong className={danger ? 'is-danger' : ''}>{amount}</strong><small>{date}</small></div></div>
}
