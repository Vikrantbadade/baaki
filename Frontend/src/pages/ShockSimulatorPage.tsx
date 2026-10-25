import { useEffect, useState } from 'react'
import { CircleHelp, Info, Check } from 'lucide-react'
import BusinessSidebar from '../components/BusinessSidebar'
import { getBusiness, type Business } from '../lib/businessData'
import './FinancialPages.css'
import { getCashflowEntries, getCashSnapshots, type CashflowEntry } from '../lib/businessData'
import { useMemo } from 'react'

const inr=(paise:number)=>`₹${new Intl.NumberFormat('en-IN',{maximumFractionDigits:0}).format(paise/100)}`
const simulationToday = new Date().toISOString().slice(0, 10)

function AssumptionSlider({
  label,
  help,
  value,
  min,
  max,
  step,
  markers,
  format,
  onChange,
}: {
  label: string
  help: string
  value: number
  min: number
  max: number
  step: number
  markers: number[]
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  const progress = ((value - min) / (max - min)) * 100
  return (
    <div className="shock-assumption-row">
      <div className="shock-assumption-label">
        <strong>{label}</strong>
        <span>{help}</span>
      </div>
      <div className="shock-range-control">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          style={{ background: `linear-gradient(to right, #087b49 ${progress}%, #dededb ${progress}%)` }}
          onChange={event => onChange(Number(event.target.value))}
        />
        <div className="shock-range-markers">
          {markers.map(marker => <span key={marker}>{format(marker)}</span>)}
        </div>
      </div>
      <output className="shock-assumption-value">{format(value)}</output>
    </div>
  )
}

export default function ShockSimulatorPage() {
  const [business, setBusiness] = useState<Business | null>(null)
  const [entries, setEntries] = useState<CashflowEntry[]>([])
  const [startingBalance, setStartingBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [paymentDelay, setPaymentDelay] = useState(7)
  const [recoveryToday, setRecoveryToday] = useState(0)
  const [supplierExtension, setSupplierExtension] = useState(0)
  const [chosen,setChosen]=useState(1)
  const scenarios=useMemo(()=>[
    {name:'Conservative',badge:'Higher risk',delay:paymentDelay+5,recovery:recoveryToday*.5,extension:Math.max(0,supplierExtension-3),copy:'Receipts slip further and supplier timing remains tight.'},
    {name:'Selected assumptions',badge:'Baseline',delay:paymentDelay,recovery:recoveryToday,extension:supplierExtension,copy:'Uses the assumptions selected above across your scheduled cash movements.'},
    {name:'Optimistic',badge:'More favorable',delay:Math.max(0,paymentDelay-3),recovery:recoveryToday,extension:supplierExtension+3,copy:'Tests earlier customer receipts and a modest supplier extension.'},
  ].map(s=>{const stream=Array(30).fill(0) as number[];for(const entry of entries){const day=Math.floor((new Date(`${entry.due_date}T00:00:00Z`).getTime()-new Date(`${simulationToday}T00:00:00Z`).getTime())/86400000);if(day<0||day>=30)continue;const shifted=entry.direction==='inflow'?day+s.delay:Math.max(0,day-s.extension);if(shifted<30)stream[shifted]+=entry.direction==='inflow'?entry.amount_paise:-entry.amount_paise}stream[0]+=s.recovery*100;let balance=startingBalance ?? 0,lowest=balance,below=0;for(const net of stream){balance+=net;lowest=Math.min(lowest,balance);if(balance<0)below++}return {...s,closing:balance,lowest,below}}),[entries,startingBalance,paymentDelay,recoveryToday,supplierExtension])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const today = new Date()
        const to = new Date(today)
        to.setDate(to.getDate() + 29)
        const [currentBusiness, snapshots, cashflowEntries] = await Promise.all([
          getBusiness(),
          getCashSnapshots(),
          getCashflowEntries(today.toISOString().slice(0, 10), to.toISOString().slice(0, 10)),
        ])
        if (!cancelled) {
          setBusiness(currentBusiness)
          setStartingBalance(snapshots.items[0]?.amount_paise ?? null)
          setEntries(cashflowEntries)
          setLoadError(null)
        }
      } catch (reason) {
        if (!cancelled) setLoadError(reason instanceof Error ? reason.message : 'Could not load current cash-flow data.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [retry])

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="shock" businessName={business?.name} />
      <main className="business-main financial-page shock-page">
        <header className="financial-page-heading">
          <div>
            <h1>Shock Simulator</h1>
            <p>Test how changes in payments and expenses affect your cash position.</p>
          </div>
        </header>
        {loadError && <div className="financial-error" role="alert"><span>{loadError}</span><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}

        <section className="financial-panel shock-assumptions">
          <header className="financial-section-heading">
            <div><h2>Adjust assumptions</h2><p>Move the sliders to change the scenario inputs.</p></div>
            <CircleHelp size={16} aria-label="Change assumptions to explore supported cash-flow scenarios" />
          </header>
          <AssumptionSlider
            label="Days until customer payment"
            help="Select the delay in expected customer payments."
            value={paymentDelay}
            min={0}
            max={21}
            step={1}
            markers={[0, 7, 14, 21]}
            format={value => `${value} days`}
            onChange={setPaymentDelay}
          />
          <AssumptionSlider
            label="Amount recovered today"
            help="Choose the amount you are able to collect now."
            value={recoveryToday}
            min={0}
            max={90000}
            step={500}
            markers={[0, 45000, 90000]}
            format={value => `₹${new Intl.NumberFormat('en-IN').format(value)}`}
            onChange={setRecoveryToday}
          />
          <AssumptionSlider
            label="Supplier payment extension"
            help="Extend the payment date for supplier bills."
            value={supplierExtension}
            min={0}
            max={14}
            step={1}
            markers={[0, 7, 14]}
            format={value => `${value} days`}
            onChange={setSupplierExtension}
          />
        </section>

        <section className="financial-panel shock-analysis">
          <header className="financial-section-heading">
            <div><h2>Analysis results</h2><p>Illustrative 30-day sensitivity test using your latest cash balance and scheduled cash movements.</p></div>
          </header>
          {loading ? <div className="financial-empty-state">Loading cash data…</div> : startingBalance === null ? <div className="financial-empty-state">Record a cash balance in Cash Flow Lab before running a scenario.</div> : <div className="shock-scenario-grid">
            {scenarios.map((scenario,index) => (
              <article className={`shock-scenario-card ${chosen===index?'is-selected':''}`} key={scenario.name} role="button" tabIndex={0} aria-pressed={chosen===index} onClick={()=>setChosen(index)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setChosen(index)}}}>
                <header>
                  <span className="shock-scenario-indicator" aria-hidden="true" />
                  <h3>{scenario.name}</h3>
                  <span className="financial-pill">{scenario.badge}</span>
                </header>
                <p className="shock-scenario-copy">{scenario.copy}</p>
                <div className="shock-result-list">
                  <div><span>Projected closing balance</span><strong>{inr(scenario.closing)}</strong></div>
                  <div><span>Lowest balance</span><strong>{inr(scenario.lowest)}</strong></div>
                  <div><span>Days below zero</span><strong>{scenario.below} days</strong></div>
                </div>
                <div className="shock-unavailable-note">{chosen===index?<Check size={14}/>:<Info size={14}/>}Client-side hypothetical · cash movements from your account</div>
              </article>
            ))}
          </div>}
          <p className="financial-notice" role="status">
            Hypothetical client-side sensitivity results; they do not change records and are not the saved backend forecast or a treasury recommendation.
          </p>
        </section>
      </main>
    </div>
  )
}
