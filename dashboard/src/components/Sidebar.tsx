import { T } from '../theme/tokens'
import { useResponsive } from '../hooks/useResponsive'
import { Logo } from './Logos'

interface SidebarProps {
  activePage: string
  onNavigate: (page: any) => void
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { isMobile, isTablet } = useResponsive()

  const items = [
    { id: 'admin', label: 'Admin', icon: '◈' },
    { id: 'vet', label: 'Vet Tester', icon: '⚕' },
    { id: 'tiers', label: 'Planes', icon: '◆' },
    { id: 'accounting', label: 'Contabilidad', icon: '₱' },
    { id: 'tracking', label: 'Tracking', icon: '⊙' },
    { id: 'mobile', label: 'Mobile', icon: '📱' },
  ]

  if (isMobile) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        background: T.surface,
        borderTop: `1px solid ${T.line}`,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 100,
        boxShadow: '0 -2px 8px rgba(0,0,0,.05)',
      }}>
        {items.slice(0, 5).map(item => {
          const active = activePage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '4px 8px',
                color: active ? T.sage : T.inkMuted,
                fontSize: 9,
                fontWeight: active ? 600 : 400,
                letterSpacing: '.3px',
                transition: 'color .15s',
              }}
            >
              <span style={{ fontSize: 20 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{
      width: isTablet ? 80 : 240,
      background: T.dark,
      padding: isTablet ? '24px 12px' : '24px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      transition: 'width .2s',
    }}>
      <div style={{
        marginBottom: 24,
        paddingLeft: isTablet ? 0 : 12,
        textAlign: isTablet ? 'center' : 'left',
      }}>
        {isTablet ? (
          <Logo size={32} text={false} inverted />
        ) : (
          <div style={{ color: T.gold, fontSize: 20, fontWeight: 600 }}>
            Nvet Care
          </div>
        )}
      </div>

      {items.map(item => {
        const active = activePage === item.id
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={isTablet ? item.label : undefined}
            style={{
              background: active ? T.darkAlt : 'transparent',
              border: active ? `1px solid ${T.darkLine}` : '1px solid transparent',
              color: active ? T.inkInv : T.inkMuted,
              padding: isTablet ? '14px 8px' : '12px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: isTablet ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: isTablet ? 'center' : 'flex-start',
              gap: isTablet ? 4 : 12,
              fontSize: isTablet ? 10 : 14,
              fontWeight: active ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: isTablet ? 20 : 18 }}>{item.icon}</span>
            <span style={{ display: isTablet ? 'none' : 'block' }}>{item.label}</span>
            {isTablet && <span style={{ fontSize: 10, marginTop: 2 }}>{item.label.slice(0, 6)}</span>}
          </button>
        )
      })}
    </div>
  )
}
