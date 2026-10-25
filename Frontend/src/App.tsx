import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { ApiError } from './lib/apiClient'
import { getBusiness } from './lib/businessData'
import { supabase } from './lib/supabase'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import BusinessSetupPage from './pages/BusinessSetupPage'
import DashboardPage from './pages/DashboardPage'
import InvoicesPage from './pages/InvoicesPage'
import CustomersPage from './pages/CustomersPage'
import BusinessProfilePage from './pages/BusinessProfilePage'
import ShockSimulatorPage from './pages/ShockSimulatorPage'
import CashFlowLabPage from './pages/CashFlowLabPage'
import RecoveryCopilotPage from './pages/RecoveryCopilotPage'
import GstCenterPage from './pages/GstCenterPage'

function SessionGate({ session }: { session: Session | null }) {
  return session ? <Outlet /> : <Navigate to="/auth" replace />
}

function BusinessGate() {
  const navigate = useNavigate()
  const [state, setState] = useState<'checking' | 'ready' | 'error'>('checking')
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let cancelled = false
    void getBusiness().then(() => {
      if (!cancelled) setState('ready')
    }).catch(error => {
      if (cancelled) return
      if (error instanceof ApiError && error.code === 'BUSINESS_NOT_FOUND') {
        navigate('/business/setup', { replace: true })
        return
      }
      setMessage(error instanceof Error ? error.message : 'Could not verify the current business.')
      setState('error')
    })
    return () => { cancelled = true }
  }, [navigate, retry])

  if (state === 'checking') return <main className="route-status" role="status">Checking your business account…</main>
  if (state === 'error') {
    return (
      <main className="route-status" role="alert">
        <p>{message}</p>
        <button type="button" onClick={() => { setState('checking'); setRetry(value => value + 1) }}>Retry</button>
      </main>
    )
  }
  return <Outlet />
}

function App() {
  const location = useLocation()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionChecked, setSessionChecked] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setSessionChecked(true)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setSession(null)
      } else {
        setSession(data.session)
      }
      setSessionChecked(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (!sessionChecked) return <main className="route-status" role="status">Restoring your session…</main>
  const passwordRecovery = location.pathname === '/auth' && new URLSearchParams(location.search).get('flow') === 'recovery'

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={session && !passwordRecovery ? <Navigate to="/dashboard" replace /> : <AuthPage />} />
      <Route element={<SessionGate session={session} />}>
        <Route path="/business/setup" element={<BusinessSetupPage />} />
        <Route element={<BusinessGate />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/settings" element={<BusinessProfilePage />} />
          <Route path="/shock-simulator" element={<ShockSimulatorPage />} />
          <Route path="/cash-flow-lab" element={<CashFlowLabPage />} />
          <Route path="/recovery-copilot" element={<RecoveryCopilotPage />} />
          <Route path="/gst-center" element={<GstCenterPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
