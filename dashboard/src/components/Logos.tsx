import { T, F } from '../theme/tokens'

interface LogoProps {
  size?: number
  text?: boolean
  inverted?: boolean
}

/**
 * Logo oficial Nvet Care — versión React del símbolo de la marca.
 *
 * Símbolo: trazo continuo serpenteante (estilo "N" estilizada con 3 ondulaciones)
 * con gradient horizontal azul → verde y dot naranja al extremo derecho.
 *
 * Wordmark: "Nvet" en azul profundo / blanco (bold) + "Care" en verde
 * principal (regular) — alineado con el brand kit oficial.
 *
 * El path es el mismo que `dashboard/public/logo.svg` (viewBox 200x100) para
 * garantizar consistencia entre el componente React y el master vectorial.
 */
export const Logo = ({ size = 36, text = true, inverted = false }: LogoProps) => {
  // ID único del gradient por instancia para evitar colisiones en SSR/SSG
  // o cuando se renderizan varios logos en la misma página (e.g. sidebar + footer)
  const gradId = `nvetGradient-${size}-${inverted ? 'inv' : 'reg'}`

  // En modo invertido (sobre fondo oscuro), el gradient va de blanco a verde
  const gradStops = inverted
    ? [
        { offset: '0%', color: '#FFFFFF' },
        { offset: '60%', color: '#9CD8B7' },
        { offset: '100%', color: T.sage },
      ]
    : [
        { offset: '0%', color: T.dark },
        { offset: '45%', color: '#1F5343' },
        { offset: '75%', color: '#2E8C68' },
        { offset: '100%', color: T.sage },
      ]

  const orangeColor = T.gold
  const wordmarkInk = inverted ? '#FFFFFF' : T.ink
  const wordmarkAccent = T.sage
  const captionColor = inverted ? 'rgba(255,255,255,0.55)' : T.inkSec

  // El símbolo es horizontal (200x100 = 2:1). Para encajar en `size` lo escalamos
  // proporcionalmente: ancho = size * 2, alto = size.
  const symW = size * 1.7
  const symH = size * 0.85

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.28,
        userSelect: 'none',
      }}
    >
      <svg
        width={symW}
        height={symH}
        viewBox="0 0 200 100"
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="50%" x2="100%" y2="50%">
            {gradStops.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>

        {/* Trazo serpenteante con 3 lobulos tipo "nnn" + esquinas redondeadas */}
        <path
          d="M 25 75 L 25 35 C 25 22 45 22 45 35 L 45 55 C 45 65 60 65 65 55 L 80 35 C 80 22 100 22 100 35 L 100 55 C 100 65 115 65 120 55 L 135 35 C 135 22 155 22 155 35 L 155 75"
          stroke={`url(#${gradId})`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Dot naranja al extremo inferior derecho */}
        <circle cx={170} cy={75} r={6} fill={orangeColor} />
      </svg>

      {text && (
        <div style={{ lineHeight: 1.05 }}>
          <div
            style={{
              fontFamily: F.sans,
              fontSize: size * 0.85,
              letterSpacing: '-0.5px',
            }}
          >
            <span style={{ color: wordmarkInk, fontWeight: 800 }}>Nvet</span>
            <span style={{ color: wordmarkAccent, fontWeight: 400, marginLeft: size * 0.12 }}>
              Care
            </span>
          </div>
          {size > 26 && (
            <div
              style={{
                fontFamily: F.sans,
                fontSize: size * 0.2,
                color: captionColor,
                letterSpacing: '1.5px',
                marginTop: size * 0.06,
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              Veterinary Platform
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface CTGMarkProps {
  size?: number
}

/**
 * Mark CTG — token de criptomoneda interna.
 * Se mantiene como círculo sólido en naranja oficial (que reemplaza al gold).
 */
export const CTGMark = ({ size = 24 }: CTGMarkProps) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="48" fill={T.gold} />
    <circle
      cx="50"
      cy="50"
      r="38"
      fill="none"
      stroke="rgba(255,255,255,.25)"
      strokeWidth="1.5"
    />
    <path
      d="M66 30C55 20 25 24 23 50c-2 26 28 32 45 22"
      stroke="rgba(255,255,255,.92)"
      strokeWidth="9.5"
      strokeLinecap="round"
      fill="none"
    />
    <text
      x="50"
      y="59"
      textAnchor="middle"
      fill="rgba(255,255,255,.95)"
      fontSize="11.5"
      fontWeight="700"
      fontFamily={F.mono}
      letterSpacing="2"
    >
      CTG
    </text>
  </svg>
)
