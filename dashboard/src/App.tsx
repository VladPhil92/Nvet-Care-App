import { useState, useEffect, type ReactNode } from 'react'
import AdminDashboard from './pages/AdminDashboard'
import VetPanel from './pages/VetPanel'
import VetOnboardingPage from './pages/VetOnboardingPage'
import ClientDashboard from './pages/ClientDashboard'
import TiersPage from './pages/TiersPage'
import AccountingPage from './pages/AccountingPage'
import TrackingPage from './pages/TrackingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import Sidebar from './components/Sidebar'
import { useResponsive } from './hooks/useResponsive'
import { useAuthStore } from './stores/useAuthStore'
import { useVetProfileQuery } from './hooks/queries/useVetQueries'
import { QueryProvider } from './lib/QueryProvider'
import { T, F } from './theme/tokens'

type AdminPage = 'admin' | 'vet' | 'tiers' | 'accounting' | 'tracking'
type PublicAuthPage = 'login' | 'register'

function AdminApp() {
  const [page, setPage] = useState<AdminPage>('admin')
  const { isMobile } = useResponsive()

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      <Sidebar activePage={page} onNavigate={(p) => setPage(p as AdminPage)} />
      <div
        style={{
          flex: 1,
          paddingBottom: isMobile ? 60 : 0,
          overflowY: 'auto',
        }}
      >
        {page === 'admin' && <AdminDashboard />}
        {page === 'vet' && <VetPanel mode="tester" />}
        {page === 'tiers' && <TiersPage />}
        {page === 'accounting' && <AccountingPage />}
        {page === 'tracking' && <TrackingPage />}
      </div>
    </div>
  )
}

function ProfessionalShell({ children }: { children: ReactNode }) {
  const { logout, isLoading } = useAuthStore()

  return (
    <div style={{ minHeight: '100vh', background: T.canvas }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '14px 24px',
          background: T.surface,
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div>
          <div style={{ fontFamily: F.serif, fontSize: 24, color: T.ink }}>Nvet Care</div>
          <div style={{ fontFamily: F.sans, fontSize: 12, color: T.inkMuted }}>
            Panel veterinario
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={isLoading}
          style={{
            border: `1px solid ${T.line}`,
            background: T.surface,
            color: T.ink,
            borderRadius: 8,
            padding: '9px 14px',
            fontFamily: F.sans,
            fontWeight: 600,
            cursor: isLoading ? 'default' : 'pointer',
          }}
        >
          {isLoading ? 'Saliendo…' : 'Cerrar sesión'}
        </button>
      </header>
      {children}
    </div>
  )
}

function VetExperience() {
  const profileQuery = useVetProfileQuery(true)
  const status = (profileQuery.error as { response?: { status?: number } } | null)?.response?.status

  return (
    <ProfessionalShell>
      {profileQuery.isError && status === 404 ? <VetOnboardingPage /> : <VetPanel mode="live" />}
    </ProfessionalShell>
  )
}

function UnknownRole() {
  const { logout, isLoading } = useAuthStore()

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: T.canvas,
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          padding: 28,
          borderRadius: 12,
          background: T.surface,
          border: `1px solid ${T.line}`,
          fontFamily: F.sans,
        }}
      >
        <h1 style={{ margin: '0 0 10px', fontSize: 22, color: T.ink }}>Cuenta sin acceso asignado</h1>
        <p style={{ margin: '0 0 22px', color: T.inkMuted, lineHeight: 1.6 }}>
          Tu identidad fue autenticada, pero el servidor no devolvió un rol válido para Nvet Care.
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={isLoading}
          style={{
            border: 0,
            borderRadius: 8,
            padding: '10px 16px',
            background: T.ink,
            color: T.surface,
            fontFamily: F.sans,
            fontWeight: 700,
            cursor: isLoading ? 'default' : 'pointer',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

function AppContent() {
  const [authPage, setAuthPage] = useState<PublicAuthPage>('login')
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (!isAuthenticated || !user) {
    return authPage === 'register' ? (
      <RegisterPage onLogin={() => setAuthPage('login')} />
    ) : (
      <LoginPage onRegister={() => setAuthPage('register')} />
    )
  }

  switch (user.role) {
    case 'CLIENT':
      return <ClientDashboard />
    case 'VET':
      return <VetExperience />
    case 'ADMIN':
    case 'SUPERADMIN':
      return <AdminApp />
    default:
      return <UnknownRole />
  }
}

export default function App() {
  return (
    <QueryProvider>
      <AppContent />
    </QueryProvider>
  )
}
