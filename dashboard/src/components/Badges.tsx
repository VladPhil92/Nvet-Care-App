import { Badge } from './UI'

type PaymentMethod = 'CTG' | 'PSE' | 'TRANSFER' | string

export const PayBadge = ({ m }: { m: PaymentMethod }) => {
  if (m === 'CTG') return <Badge variant="gold">◈ CTG Token</Badge>
  if (m === 'PSE') return <Badge variant="pse">⬡ PSE</Badge>
  if (m === 'TRANSFER') return <Badge variant="trf">→ Transferencia</Badge>
  return <Badge>{m}</Badge>
}

type TierType = 'free' | 'pro' | 'elite'

export const TierBadge = ({ t }: { t: TierType }) => {
  const map = { free: 'free', pro: 'pro', elite: 'elite' } as const
  const names = { free: 'Free Vet', pro: 'VetPro', elite: 'VetElite' }
  const icons = { free: '·', pro: '◆', elite: '◈' }

  return (
    <Badge variant={map[t]}>
      {icons[t]} {names[t]}
    </Badge>
  )
}
