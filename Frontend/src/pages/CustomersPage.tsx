import { useEffect, useState, type FormEvent } from 'react'
import { Archive, Plus, RefreshCw, Save, X } from 'lucide-react'
import BusinessSidebar from '../components/BusinessSidebar'
import { apiRequest } from '../lib/apiClient'
import { getAllCustomers, getBusiness, type Business, type Customer } from '../lib/businessData'
import './FinancialPages.css'

interface CustomerLedger {
  invoices: Array<{
    id: string
    invoice_number: string | null
    status: string
    due_date: string | null
    outstanding_paise: number
  }>
  payments: Array<{
    id: string
    amount_paise: number
    method: string
    received_at: string
    status: string
  }>
  outstandingPaise: number
  paymentTotalPaise: number
}

interface CustomerForm {
  name: string
  email: string
  phone: string
  taxId: string
}

const emptyForm: CustomerForm = { name: '', email: '', phone: '', taxId: '' }
const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const formatMoney = (paise: number) => `₹${money.format(paise / 100)}`

export default function CustomersPage() {
  const [business, setBusiness] = useState<Business | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selected, setSelected] = useState<Customer | null>(null)
  const [ledger, setLedger] = useState<{ customerId: string; data: CustomerLedger } | null>(null)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [currentBusiness, list] = await Promise.all([getBusiness(), getAllCustomers()])
        if (cancelled) return
        setBusiness(currentBusiness)
        setCustomers(list)
        setSelected(current => current ? list.find(customer => customer.id === current.id) ?? null : list[0] ?? null)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load customers.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [retry])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    void apiRequest<CustomerLedger>(`/customers/${encodeURIComponent(selected.id)}/ledger`).then(value => {
      if (!cancelled) setLedger({ customerId: selected.id, data: value })
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load the customer ledger.')
    })
    return () => { cancelled = true }
  }, [selected, retry])
  const currentLedger = selected && ledger?.customerId === selected.id ? ledger.data : null

  function startCreate() {
    setSelected(null)
    setEditingId(null)
    setForm(emptyForm)
    setFormOpen(true)
    setError(null)
  }

  function startEdit(customer: Customer) {
    setEditingId(customer.id)
    setForm({
      name: customer.name,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      taxId: customer.tax_id ?? '',
    })
    setFormOpen(true)
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name.trim(),
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.taxId.trim() ? { taxId: form.taxId.trim() } : {}),
    }
    try {
      const customer = await apiRequest<Customer>(
        editingId ? `/customers/${encodeURIComponent(editingId)}` : '/customers',
        { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      )
      setCustomers(current => editingId
        ? current.map(item => item.id === customer.id ? customer : item)
        : [customer, ...current])
      setSelected(customer)
      setFormOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the customer.')
    } finally {
      setSaving(false)
    }
  }

  async function archive(customer: Customer) {
    if (!window.confirm(`Archive ${customer.name}? It will no longer appear in active customer lists.`)) return
    setError(null)
    try {
      await apiRequest<void>(`/customers/${encodeURIComponent(customer.id)}`, { method: 'DELETE' })
      setCustomers(current => current.filter(item => item.id !== customer.id))
      setSelected(current => current?.id === customer.id ? null : current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not archive the customer.')
    }
  }

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="customers" businessName={business?.name} />
      <main className="business-main financial-page">
        <header className="financial-page-heading">
          <div><h1>Customers</h1><p>Manage customer records and review account ledgers.</p></div>
          <button type="button" className="financial-primary-button" onClick={startCreate}><Plus size={15} />Add customer</button>
        </header>
        {error && <div className="financial-error" role="alert"><span>{error}</span><button type="button" onClick={() => { setError(null); setLoading(true); setRetry(value => value + 1) }}><RefreshCw size={13} />Retry</button></div>}
        <div className="cashflow-bottom-grid">
          <section className="financial-panel">
            <header className="financial-small-heading"><h2>Active customers</h2><span>{customers.length}</span></header>
            {loading ? <div className="financial-empty-state">Loading customers…</div> : customers.length === 0 ? <div className="financial-empty-state">No active customers yet. Add a customer to begin.</div> : customers.map(customer => (
              <button type="button" key={customer.id} className="cashflow-entry-row" onClick={() => { setSelected(customer); setFormOpen(false) }}>
                <strong>{customer.name}</strong><span>{customer.email ?? customer.phone ?? 'No contact details'}</span><span>{customer.tax_id ?? 'No tax ID'}</span>
              </button>
            ))}
          </section>

          <section className="financial-panel">
            {formOpen ? (
              <>
                <header className="financial-small-heading"><h2>{editingId ? 'Edit customer' : 'New customer'}</h2><button type="button" onClick={() => setFormOpen(false)} aria-label="Close"><X size={15} /></button></header>
                <form className="invoice-modal-form" onSubmit={submit}>
                  <label>Name<input required maxLength={200} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
                  <label>Email<input type="email" maxLength={254} value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} /></label>
                  <label>Phone<input maxLength={32} value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} /></label>
                  <label>Tax ID<input maxLength={30} value={form.taxId} onChange={event => setForm(current => ({ ...current, taxId: event.target.value }))} /></label>
                  <button type="submit" className="financial-primary-button" disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save customer'}</button>
                </form>
              </>
            ) : selected ? (
              <>
                <header className="financial-small-heading"><div><h2>{selected.name}</h2><span>{selected.email ?? selected.phone ?? 'No contact details'}</span></div><button type="button" onClick={() => startEdit(selected)}>Edit</button></header>
                <div className="cashflow-kpi-grid">
                  <div className="cashflow-kpi-card"><span>Outstanding</span><strong>{currentLedger ? formatMoney(currentLedger.outstandingPaise) : '—'}</strong></div>
                  <div className="cashflow-kpi-card"><span>Payments recorded</span><strong>{currentLedger ? formatMoney(currentLedger.paymentTotalPaise) : '—'}</strong></div>
                </div>
                <h3>Invoices</h3>
                {!currentLedger ? <div className="financial-empty-state">Loading ledger…</div> : currentLedger.invoices.length === 0 ? <div className="financial-empty-state">No invoices for this customer.</div> : currentLedger.invoices.map(invoice => (
                  <div className="cashflow-entry-row" key={invoice.id}><strong>{invoice.invoice_number ?? 'Draft'}</strong><span>{invoice.status.replaceAll('_', ' ')}</span><span>Due {invoice.due_date ?? '—'}</span><strong>{formatMoney(invoice.outstanding_paise)}</strong></div>
                ))}
                <h3>Payments</h3>
                {!currentLedger ? <div className="financial-empty-state">Loading ledger…</div> : currentLedger.payments.length === 0 ? <div className="financial-empty-state">No payments recorded.</div> : currentLedger.payments.map(payment => (
                  <div className="cashflow-entry-row" key={payment.id}><strong>{formatMoney(payment.amount_paise)}</strong><span>{payment.method.replaceAll('_', ' ')}</span><span>{new Date(payment.received_at).toLocaleDateString('en-IN')}</span><span>{payment.status}</span></div>
                ))}
                <button type="button" className="financial-outline-button" onClick={() => void archive(selected)}><Archive size={14} />Archive customer</button>
              </>
            ) : <div className="financial-empty-state">Select a customer to view its ledger.</div>}
          </section>
        </div>
      </main>
    </div>
  )
}
