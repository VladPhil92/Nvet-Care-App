// Design Tokens — Nvet Care brand identity (paleta oficial)
//
// Fuente: brand kit oficial entregado en /public/images/Corporative Images/
// Paleta: Azul Profundo + Verde Principal + Naranja Acento + Grises neutros

const BRAND_COLORS = {
  blueDeep: '#0D1B2A',
  blueDeepAlt: '#162536',
  blueDeepLight: '#1F3349',
  greenPrimary: '#34B27A',
  greenDark: '#268A5C',
  greenAccessible: '#1E7048',
  greenLight: '#B7E4C7',
  greenLightAlt: '#D5F0DD',
  orangeAccent: '#FF8A3D',
  orangeDark: '#E66A1A',
  orangeAccessible: '#B8511A',
  grayLight: '#F2F4F7',
  grayMedium: '#D5D9E0',
  grayDark: '#333A40',
  grayDarkAlt: '#454D54',
} as const

const SECONDARY_COLORS = {
  purple: '#7B6FF6',
  skyBlue: '#6EC1F4',
  yellow: '#FFD97A',
  pink: '#FF8FA3',
  teal: '#2EC4B6',
} as const

export const T = {
  canvas: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFBFC',
  line: '#E5E8ED',
  lineHi: BRAND_COLORS.grayMedium,
  ink: BRAND_COLORS.blueDeep,
  inkSec: BRAND_COLORS.grayDark,
  inkMuted: BRAND_COLORS.grayDarkAlt,
  inkInv: '#FFFFFF',
  sage: BRAND_COLORS.greenPrimary,
  sageLt: BRAND_COLORS.greenLight,
  sageFade: BRAND_COLORS.greenPrimary + '14',
  sageText: BRAND_COLORS.greenAccessible,
  greenSoft: BRAND_COLORS.greenLight,
  greenSoftAlt: BRAND_COLORS.greenLightAlt,
  gold: BRAND_COLORS.orangeAccent,
  goldLt: '#FFB07A',
  goldFade: BRAND_COLORS.orangeAccent + '14',
  goldText: BRAND_COLORS.orangeAccessible,
  payPSE: '#1A56DB',
  payTRF: '#0F766E',
  payCTG: BRAND_COLORS.orangeAccent,
  ok: BRAND_COLORS.greenAccessible,
  warn: '#B8511A',
  err: '#C53030',
  pending: BRAND_COLORS.grayDark,
  dark: BRAND_COLORS.blueDeep,
  darkAlt: BRAND_COLORS.blueDeepAlt,
  darkLine: BRAND_COLORS.blueDeepLight,
  accentPurple: SECONDARY_COLORS.purple,
  accentSky: SECONDARY_COLORS.skyBlue,
  accentYellow: SECONDARY_COLORS.yellow,
  accentPink: SECONDARY_COLORS.pink,
  accentTeal: SECONDARY_COLORS.teal,
}

export const F = {
  sans: "'DM Sans', 'Nunito Sans', sans-serif",
  serif: "'Cormorant Garamond', 'Garamond', serif",
  mono: "'DM Mono', 'Courier New', monospace",
}

export const BREAKPOINTS = {
  mobile: 360,
  mobileLg: 428,
  tablet: 768,
  tabletLg: 1024,
  desktop: 1280,
  desktopLg: 1920,
}

export const SPACING = {
  mobile: { base: 4, gutter: 16, cardPadding: 16, section: 20 },
  tablet: { base: 6, gutter: 24, cardPadding: 20, section: 24 },
  desktop: { base: 8, gutter: 32, cardPadding: 24, section: 28 },
}

export const TYPOGRAPHY_SIZES = {
  mobile: {
    h1: 24,
    h2: 20,
    h3: 16,
    body: 14,
    caption: 12,
    label: 10,
  },
  tablet: {
    h1: 28,
    h2: 22,
    h3: 18,
    body: 15,
    caption: 13,
    label: 11,
  },
  desktop: {
    h1: 32,
    h2: 24,
    h3: 20,
    body: 16,
    caption: 14,
    label: 11,
  },
}

export const MEDIA = {
  mobile: `@media (max-width: ${BREAKPOINTS.tablet - 1}px)`,
  tablet: `@media (min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.desktop - 1}px)`,
  desktop: `@media (min-width: ${BREAKPOINTS.desktop}px)`,
  mobileOnly: `@media (max-width: ${BREAKPOINTS.mobileLg}px)`,
  tabletUp: `@media (min-width: ${BREAKPOINTS.tablet}px)`,
  desktopUp: `@media (min-width: ${BREAKPOINTS.desktop}px)`,
}

/**
 * Snapshot UI de la política comercial canónica del backend.
 * La API de membresías sigue siendo la autoridad de estado/activación.
 */
export const TIERS = {
  free: {
    id: 'free',
    apiTier: 'FREE' as const,
    name: 'Free Vet',
    badge: 'GRATIS',
    priceCOP: 0,
    commission: 10,
    color: T.inkMuted,
    perks: [
      'Servicios y citas ilimitados',
      'Perfil profesional verificado',
      'CTG · PSE · Transferencia',
      '10% de comisión por transacción',
    ],
  },
  pro: {
    id: 'pro',
    apiTier: 'PRO' as const,
    name: 'VetPro',
    badge: 'PRO',
    priceCOP: 39900,
    commission: 8,
    color: T.sage,
    perks: [
      'Servicios y citas ilimitados',
      '8% de comisión por transacción',
      'Perfil destacado',
      'Chat prioritario',
      'Reportes mensuales',
    ],
  },
  elite: {
    id: 'elite',
    apiTier: 'ELITE' as const,
    name: 'VetElite',
    badge: 'ELITE',
    priceCOP: 79900,
    commission: 3,
    color: T.gold,
    perks: [
      'Servicios y citas ilimitados',
      '3% de comisión por transacción',
      'Prioridad de posicionamiento',
      'Insignia Elite verificada',
      'Analytics avanzado',
      'Soporte dedicado',
      'Acceso anticipado a nuevas funciones',
    ],
  },
}
