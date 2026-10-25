import {
  Archive,
  ChartNoAxesCombined,
  FileText,
  History,
  LayoutDashboard,
  Radar,
  Receipt,
  Settings,
  ShieldCheck,
  UsersRound,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { signOut } from '../lib/authService'
import './BusinessSidebar.css'

type PageKey = 'dashboard' | 'invoices' | 'customers' | 'recovery' | 'cashflow-lab' | 'shock' | 'gst' | 'settings'

interface NavigationItem {
  label: string
  icon: LucideIcon
  page?: PageKey
  separatorAfter?: boolean
}

const navigation: NavigationItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, page: 'dashboard' },
  { label: 'Invoices', icon: FileText, page: 'invoices' },
  { label: 'Customers', icon: UsersRound, page: 'customers', separatorAfter: true },
  { label: 'Recovery Copilot', icon: History, page: 'recovery' },
  { label: 'Cash Flow Lab', icon: ChartNoAxesCombined, page: 'cashflow-lab' },
  { label: 'Shock Simulator', icon: Zap, page: 'shock' },
  { label: 'GST Center', icon: Receipt, page: 'gst' },
  { label: 'Permissions', icon: ShieldCheck },
  { label: 'Evidence Vault', icon: Archive, separatorAfter: true },
  { label: 'Cash Flow', icon: Wallet },
  { label: 'Cash-Crash Radar', icon: Radar },
  { label: 'Settings', icon: Settings, page: 'settings' },
]

interface BusinessSidebarProps {
  activePage: PageKey
  businessName?: string
}

export default function BusinessSidebar({ activePage, businessName }: BusinessSidebarProps) {
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const businessInitial = businessName?.trim().charAt(0).toUpperCase()

  return (
    <aside className="business-sidebar" aria-label="Main navigation">
      <NavLink className="business-brand" to="/dashboard" aria-label="BAAKI Dashboard">
        <img src="/assets/brand/rupee_logo.png" alt="" />
        <span>BAAKI</span>
      </NavLink>

      <nav className="business-navigation">
        {navigation.map(({ label, icon: Icon, page, separatorAfter }) => {
          const item = page ? (
            <NavLink
              key={label}
              to={pathForPage(page)}
              className={`business-nav-item ${activePage === page ? 'is-active' : ''}`}
              aria-current={activePage === page ? 'page' : undefined}
            >
              <span className="business-nav-icon"><Icon size={20} strokeWidth={1.7} /></span>
              <span>{label}</span>
            </NavLink>
          ) : (
            <a
              key={label}
              href="#"
              className="business-nav-item"
              aria-disabled="true"
              title={`${label} is not part of this implementation`}
              onClick={event => event.preventDefault()}
            >
              <span className="business-nav-icon"><Icon size={20} strokeWidth={1.7} /></span>
              <span>{label}</span>
            </a>
          )

          return (
            <div key={label} className={separatorAfter ? 'business-nav-group business-nav-group--separated' : 'business-nav-group'}>
              {item}
            </div>
          )
        })}
      </nav>

      <div className="business-profile" title={businessName ?? 'No business connected'}>
        <span className="business-profile-avatar">{businessInitial || <UsersRound size={16} />}</span>
        <span>{businessName || 'No business connected'}</span>
      </div>
      <button
        type="button"
        className="business-nav-item"
        onClick={async () => {
          const result = await signOut()
          if (!result.success) {
            setLogoutError(result.error ?? 'Could not sign out.')
            return
          }
          window.location.assign('/auth')
        }}
      >
        Sign out
      </button>
      {logoutError && <p role="alert">{logoutError}</p>}
    </aside>
  )
}

function pathForPage(page: PageKey): string {
  switch (page) {
    case 'dashboard': return '/dashboard'
    case 'invoices': return '/invoices'
    case 'customers': return '/customers'
    case 'recovery': return '/recovery-copilot'
    case 'cashflow-lab': return '/cash-flow-lab'
    case 'shock': return '/shock-simulator'
    case 'gst': return '/gst-center'
    case 'settings': return '/settings'
  }
}
