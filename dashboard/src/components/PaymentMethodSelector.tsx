import { T } from '../theme/tokens'
import { CTGMark } from './Logos'

type PaymentMethod = 'CTG' | 'PSE' | 'TRANSFER'

interface PaySelectorProps {
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
  amount?: number
  mode?: 'full' | 'compact'
}

export const PaymentMethodSelector = ({ value, onChange, amount = 0, mode = 'full' }: PaySelectorProps) => {
  const CTG_RATE = 420

  const opts = [
    {
      id: 'CTG' as PaymentMethod,
      icon: <CTGMark size={26} />,
      label: 'CTG One Token',
      detail: `${(amount / CTG_RATE).toFixed(2)} CTG`,
      sub: 'Descuento 5.5% · Polygon',
      accent: T.gold,
    },
    {
      id: 'PSE' as PaymentMethod,
      icon: <span style={{ fontSize: 18 }}>⬡</span>,
      label: 'PSE',
      detail: `$${amount.toLocaleString('es-CO')} COP`,
      sub: 'ACH Colombia',
      accent: T.payPSE,
    },
    {
      id: 'TRANSFER' as PaymentMethod,
      icon: <span style={{ fontSize: 18 }}>→</span>,
      label: 'Transferencia',
      detail: `$${amount.toLocaleString('es-CO')} COP`,
      sub: 'Nequi · Daviplata · Bancol.',
      accent: T.payTRF,
    },
  ]

  if (mode === 'compact') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        {opts.map((o) => (
          <div
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: `1.5px solid ${value === o.id ? o.accent : T.line}`,
              background: value === o.id ? `${o.accent}08` : T.surface,
              cursor: 'pointer',
              transition: 'all .15s',
              textAlign: 'center',
            }}
          >
            <div style={{ marginBottom: 4 }}>{o.icon}</div>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: value === o.id ? o.accent : T.inkSec,
            }}>
              {o.id}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {opts.map((o, i) => (
        <div
          key={o.id}
          onClick={() => onChange(o.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 16px',
            borderRadius: 10,
            border: `1.5px solid ${value === o.id ? o.accent : T.line}`,
            background: value === o.id ? `${o.accent}07` : T.surface,
            cursor: 'pointer',
            transition: 'all .15s',
            position: 'relative',
          }}
        >
          {i === 0 && (
            <span style={{
              position: 'absolute',
              top: -9,
              right: 14,
              background: T.gold,
              color: T.surface,
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 10,
              letterSpacing: 1,
            }}>
              RECOMENDADO
            </span>
          )}
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            background: `${o.accent}12`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {o.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{o.label}</div>
            <div style={{ fontSize: 12, color: o.accent, fontWeight: 500, marginTop: 1 }}>
              {o.detail} · {o.sub}
            </div>
          </div>
          <div style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: `1.5px solid ${value === o.id ? o.accent : T.lineHi}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {value === o.id && (
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: o.accent,
              }} />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
