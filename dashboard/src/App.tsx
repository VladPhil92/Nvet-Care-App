import { useState } from 'react'
import AdminDashboard from './pages/AdminDashboard'
import VetPanel from './pages/VetPanel'
import TiersPage from './pages/TiersPage'
import AccountingPage from './pages/AccountingPage'
import TrackingPage from './pages/TrackingPage'
import MobileApp from './pages/MobileApp'
import Sidebar from './components/Sidebar'
import { useResponsive } from './hooks/useResponsive'

type Page = 'admin' | 'vet' | 'tiers' | 'accounting' | 'tracking' | 'mobile'

function App() {
  const [page, setPage] = useState<Page>('admin')
  const [mobileScreen, setMobileScreen] = useState<string>('home')
  const { isMobile } = useResponsive()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: isMobile ? 'column' : 'row' }}>
      <Sidebar activePage={page} onNavigate={setPage} />
      <div style={{ 
        flex: 1,
        // En mobile, dejar espacio para bottom nav
        paddingBottom: isMobile ? 60 : 0,
        overflowY: 'auto',
      }}>
        {page === 'admin' && <AdminDashboard />}
        {page === 'vet' && <VetPanel />}
        {page === 'tiers' && <TiersPage />}
        {page === 'accounting' && <AccountingPage />}
        {page === 'tracking' && <TrackingPage />}
        {page === 'mobile' && <MobileApp screen={mobileScreen} setScreen={setMobileScreen} />}
      </div>
    </div>
  )
}

export default App
