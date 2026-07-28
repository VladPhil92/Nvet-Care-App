import { T } from '../theme/tokens'

interface MobileAppProps {
  screen: string
  setScreen: (screen: string) => void
}

export default function MobileApp({ screen, setScreen: _setScreen }: MobileAppProps) {
  return (
    <div style={{ padding: '28px 32px' }}>
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, marginBottom: 24 }}>
        Mobile Preview
      </h1>
      <div style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        padding: 24,
      }}>
        <p style={{ color: T.inkSec }}>
          Vista previa de la app móvil - En desarrollo
        </p>
        <p style={{ color: T.inkMuted, fontSize: 14, marginTop: 8 }}>
          Pantalla actual: {screen}
        </p>
      </div>
    </div>
  )
}
