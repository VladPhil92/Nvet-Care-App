import { CSSProperties, ReactNode } from 'react'
import { T, F } from '../theme/tokens'

// Button Component
interface BtnProps {
  children: ReactNode
  variant?: 'primary' | 'gold' | 'ghost' | 'danger' | 'pse' | 'transfer' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  disabled?: boolean
  full?: boolean
  style?: CSSProperties
}

export const Btn = ({ children, variant = 'primary', size = 'md', onClick, disabled, full, style: sx }: BtnProps) => {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: F.sans,
    fontWeight: 600,
    letterSpacing: '.1px',
    borderRadius: 8,
    transition: 'all .15s',
    opacity: disabled ? 0.45 : 1,
    width: full ? '100%' : 'auto',
    padding: size === 'sm' ? '6px 14px' : size === 'lg' ? '14px 28px' : '10px 20px',
    fontSize: size === 'sm' ? 12 : 14,
    ...sx,
  }

  const variants = {
    primary: { background: T.sage, color: T.inkInv, boxShadow: '0 1px 3px rgba(74,103,65,.25)' },
    gold: { background: T.gold, color: T.surface, boxShadow: '0 1px 3px rgba(184,150,46,.25)' },
    ghost: { background: 'transparent', color: T.inkSec, border: `1px solid ${T.line}` },
    danger: { background: 'transparent', color: T.err, border: `1px solid ${T.err}33` },
    pse: { background: 'transparent', color: T.payPSE, border: `1px solid ${T.payPSE}44` },
    transfer: { background: 'transparent', color: T.payTRF, border: `1px solid ${T.payTRF}44` },
    dark: { background: T.dark, color: T.inkInv },
  }

  return (
    <button style={{ ...base, ...variants[variant] }} onClick={!disabled ? onClick : undefined}>
      {children}
    </button>
  )
}

// Badge Component
interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'sage' | 'gold' | 'ok' | 'warn' | 'err' | 'pse' | 'trf' | 'free' | 'pro' | 'elite' | 'dark'
}

export const Badge = ({ children, variant = 'default' }: BadgeProps) => {
  const variants = {
    default: { background: T.surfaceAlt, color: T.inkSec },
    sage: { background: `${T.sage}12`, color: T.sage, border: `1px solid ${T.sage}30` },
    gold: { background: `${T.gold}12`, color: T.gold, border: `1px solid ${T.gold}30` },
    ok: { background: `${T.ok}10`, color: T.ok, border: `1px solid ${T.ok}30` },
    warn: { background: `${T.warn}10`, color: T.warn, border: `1px solid ${T.warn}30` },
    err: { background: `${T.err}10`, color: T.err, border: `1px solid ${T.err}30` },
    pse: { background: `${T.payPSE}10`, color: T.payPSE, border: `1px solid ${T.payPSE}30` },
    trf: { background: `${T.payTRF}10`, color: T.payTRF, border: `1px solid ${T.payTRF}30` },
    free: { background: T.surfaceAlt, color: T.inkMuted, border: `1px solid ${T.line}` },
    pro: { background: `${T.sage}10`, color: T.sage, border: `1px solid ${T.sage}30` },
    elite: { background: `${T.gold}10`, color: T.gold, border: `1px solid ${T.gold}30` },
    dark: { background: T.dark, color: T.inkInv },
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '.3px',
      ...variants[variant],
    }}>
      {children}
    </span>
  )
}

// Metric Card
interface MetricProps {
  label: string
  value: string | number
  sub?: string
  accent?: string
}

export const Metric = ({ label, value, sub, accent = T.sage }: MetricProps) => (
  <div style={{
    background: T.surface,
    borderRadius: 12,
    border: `1px solid ${T.line}`,
    padding: '20px 22px',
    borderLeft: `2px solid ${accent}`,
  }}>
    <div style={{
      fontFamily: F.sans,
      fontSize: 11,
      fontWeight: 600,
      color: T.inkMuted,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      marginBottom: 10,
    }}>
      {label}
    </div>
    <div style={{
      fontFamily: F.serif,
      fontSize: 28,
      fontWeight: 400,
      color: T.ink,
      letterSpacing: '-.5px',
    }}>
      {value}
    </div>
    {sub && (
      <div style={{
        fontFamily: F.sans,
        fontSize: 12,
        color: T.inkMuted,
        marginTop: 6,
      }}>
        {sub}
      </div>
    )}
  </div>
)

// Field Wrapper
interface FieldProps {
  label: string
  children: ReactNode
}

export const Field = ({ label, children }: FieldProps) => (
  <div>
    <div style={{
      fontFamily: F.sans,
      fontSize: 11,
      fontWeight: 600,
      color: T.inkMuted,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      marginBottom: 8,
    }}>
      {label}
    </div>
    {children}
  </div>
)

// Progress Bar
interface BarProps {
  pct: number
  color?: string
  thin?: boolean
}

export const Bar = ({ pct, color = T.sage, thin }: BarProps) => (
  <div style={{
    height: thin ? 2 : 4,
    borderRadius: 2,
    background: T.surfaceAlt,
    overflow: 'hidden',
  }}>
    <div style={{
      width: `${Math.min(pct, 100)}%`,
      height: '100%',
      background: color,
      borderRadius: 2,
      transition: 'width .5s ease',
    }} />
  </div>
)

// Divider
interface HrProps {
  my?: number
}

export const Hr = ({ my = 20 }: HrProps) => (
  <div style={{ height: 1, background: T.line, margin: `${my}px 0` }} />
)

// Input Styles
// eslint-disable-next-line react-refresh/only-export-components
export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: T.surfaceAlt,
  border: `1px solid ${T.line}`,
  borderRadius: 8,
  color: T.ink,
  fontSize: 14,
  fontFamily: F.sans,
  transition: 'border .15s',
}

// Card Style
// eslint-disable-next-line react-refresh/only-export-components
export const cardStyle: CSSProperties = {
  background: T.surface,
  borderRadius: 12,
  border: `1px solid ${T.line}`,
}
