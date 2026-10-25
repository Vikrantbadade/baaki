import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import BusinessSidebar from '../components/BusinessSidebar'
import { apiRequest } from '../lib/apiClient'
import './FinancialPages.css'

export default function BusinessSetupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [gstin, setGstin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiRequest('/businesses', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          ...(legalName.trim() ? { legalName: legalName.trim() } : {}),
          ...(gstin.trim() ? { gstin: gstin.trim() } : {}),
        }),
      })
      navigate('/dashboard', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create your business.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="business-app-shell">
      <BusinessSidebar activePage="dashboard" />
      <main className="business-main financial-page">
        <header className="financial-page-heading">
          <div><h1>Set up your business</h1><p>Business details are saved to your Baaki account.</p></div>
        </header>
        <section className="financial-panel">
          <form className="invoice-modal-form" onSubmit={submit}>
            <label>Business name
              <input required maxLength={200} value={name} onChange={event => setName(event.target.value)} />
            </label>
            <label>Legal name (optional)
              <input maxLength={200} value={legalName} onChange={event => setLegalName(event.target.value)} />
            </label>
            <label>GSTIN (optional)
              <input maxLength={15} value={gstin} onChange={event => setGstin(event.target.value)} />
            </label>
            {error && <p className="invoice-modal-error" role="alert">{error}</p>}
            <button className="financial-primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create business'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
