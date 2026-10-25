import { useEffect, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import BusinessSidebar from '../components/BusinessSidebar'
import { apiRequest } from '../lib/apiClient'
import { getBusiness, type Business } from '../lib/businessData'
import './FinancialPages.css'

interface ProfileForm {
  name: string
  legalName: string
  gstin: string
}

export default function BusinessProfilePage() {
  const [business, setBusiness] = useState<Business | null>(null)
  const [form, setForm] = useState<ProfileForm>({ name: '', legalName: '', gstin: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    void getBusiness().then(value => {
      if (cancelled) return
      setBusiness(value)
      setForm({ name: value.name, legalName: value.legal_name ?? '', gstin: value.gstin ?? '' })
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not load business details.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [retry])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await apiRequest<Business>('/businesses/current', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          legalName: form.legalName.trim(),
          gstin: form.gstin.trim(),
        }),
      })
      setBusiness(updated)
      setForm({ name: updated.name, legalName: updated.legal_name ?? '', gstin: updated.gstin ?? '' })
      setSuccess('Business profile updated.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update the business profile.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="settings" businessName={business?.name} />
      <main className="business-main financial-page">
        <header className="financial-page-heading"><div><h1>Business profile</h1><p>Update the details used by your business account.</p></div></header>
        {error && <div className="financial-error" role="alert"><span>{error}</span><button type="button" onClick={() => { setLoading(true); setRetry(value => value + 1) }}>Retry</button></div>}
        {loading ? <div className="financial-empty-state">Loading business details…</div> : (
          <section className="financial-panel">
            <form className="invoice-modal-form" onSubmit={submit}>
              <label>Business name<input required maxLength={200} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
              <label>Legal name<input maxLength={200} value={form.legalName} onChange={event => setForm(current => ({ ...current, legalName: event.target.value }))} /></label>
              <label>GSTIN<input maxLength={15} value={form.gstin} onChange={event => setForm(current => ({ ...current, gstin: event.target.value }))} /></label>
              {success && <p role="status">{success}</p>}
              <button type="submit" className="financial-primary-button" disabled={saving}><Save size={14} />{saving ? 'Saving…' : 'Save profile'}</button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}
