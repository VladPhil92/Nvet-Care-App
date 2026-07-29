import { useState, useEffect } from 'react'
import AdminDashboard from './pages/AdminDashboard'
import VetPanel from './pages/VetPanel'
import TiersPage from './pages/TiersPage'
import AccountingPage from './pages/AccountingPage'
import TrackingPage from './pages/TrackingPage'
import LoginPage from './pages/LoginPage'
import Sidebar from './components/Sidebar'
import { useResponsive } from './hooks/useResponsive'
import { useAuthStore } from './stores/useAuthStore'
import { QueryProvider } from './lib/QueryProvider'

type Page = 'admin' | 'vet' | 'tiers' | 'accounting' | 'tracking'

function AppContent() {
  const [page, setPage] = useState<Page>('admin')
  const { isMobile } = useResponsive()
  const { isAuthenticated, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        flexDirection: isMobile ? 'column' : 'row',
      }}
    >
      <Sidebar activePage={page} onNavigate={(p) => setPage(p as Page)} />
      <div
        style={{
          flex: 1,
          paddingBottom: isMobile ? 60 : 0,
          overflowY: 'auto',
        }}
      >
        {page === 'admin' && <AdminDashboard />}
        {page === 'vet' && <VetPanel />}
        {page === 'tiers' && <TiersPage />}
        {page === 'accounting' && <AccountingPage />}
        {page === 'tracking' && <TrackingPage />}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryProvider>
      <AppContent />
    </QueryProvider>
  )
}
