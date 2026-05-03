// Design Tokens — Nvet Care brand identity (paleta oficial)
//
// Fuente: brand kit oficial entregado en /public/images/Corporative Images/
// Paleta: Azul Profundo + Verde Principal + Naranja Acento + Grises neutros
//
// IMPORTANTE: los nombres de tokens (T.sage, T.gold, T.dark, T.ink, T.canvas)
// se mantienen para compatibilidad retroactiva con todos los componentes
// existentes; lo que cambia son los HEX codes a la paleta oficial.
//
// Mapping conceptual:
//   T.sage          → Verde Principal #34B27A (antes era sage #5B7553)
//   T.gold          → Naranja Acento  #FF8A3D (antes era gold #C9A961)
//   T.dark          → Azul Profundo   #0D1B2A (antes era charcoal #1A1915)
//   T.ink           → Azul Profundo   #0D1B2A (texto primario)
//   T.canvas        → Gris Claro      #F2F4F7 (antes era ivory #F8F6F2)

// Brand colors oficiales — source-of-truth
const BRAND_COLORS = {
  // Azul profundo: confianza, profesionalismo, seguridad
  blueDeep: '#0D1B2A',
  blueDeepAlt: '#162536',
  blueDeepLight: '#1F3349',

  // Verde principal: salud, bienestar, crecimiento
  greenPrimary: '#34B27A',
  greenDark: '#268A5C',
  greenAccessible: '#1E7048', // 7:1 sobre canvas, para texto AAA

  // Verde claro: calma, frescura, armonía (acento suave)
  greenLight: '#B7E4C7',
  greenLightAlt: '#D5F0DD',

  // Naranja acento: energía, acción, destacados
  orangeAccent: '#FF8A3D',
  orangeDark: '#E66A1A',
  orangeAccessible: '#B8511A', // 4.5:1 large text AAA

  // Grises neutros
  grayLight: '#F2F4F7',
  grayMedium: '#D5D9E0',
  grayDark: '#333A40',
  grayDarkAlt: '#454D54',
} as const

// Paleta secundaria — ilustraciones, status accents, charts
const SECONDARY_COLORS = {
  purple: '#7B6FF6',
  skyBlue: '#6EC1F4',
  yellow: '#FFD97A',
  pink: '#FF8FA3',
  teal: '#2EC4B6',
} as const

export const T = {
  // Neutrals (paleta oficial)
  canvas: '#F2F4F7',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFBFC',
  line: '#E5E8ED',
  lineHi: BRAND_COLORS.grayMedium,

  // Text hierarchy — sobre canvas claro
  ink: BRAND_COLORS.blueDeep,
  inkSec: BRAND_COLORS.grayDark,
  inkMuted: BRAND_COLORS.grayDarkAlt,
  inkInv: '#FFFFFF',

  // Brand green (alias mantenido por compat)
  sage: BRAND_COLORS.greenPrimary,
  sageLt: BRAND_COLORS.greenLight,
  sageFade: BRAND_COLORS.greenPrimary + '14',
  sageText: BRAND_COLORS.greenAccessible, // para uso textual AAA

  // Verde claro (acento suave / fondos de cards "saludables")
  greenSoft: BRAND_COLORS.greenLight,
  greenSoftAlt: BRAND_COLORS.greenLightAlt,

  // Naranja accent (alias "gold" mantenido por compat)
  gold: BRAND_COLORS.orangeAccent,
  goldLt: '#FFB07A',
  goldFade: BRAND_COLORS.orangeAccent + '14',
  goldText: BRAND_COLORS.orangeAccessible, // para uso textual

  // Payments
  payPSE: '#1A56DB',
  payTRF: '#0F766E',
  payCTG: BRAND_COLORS.orangeAccent,

  // Status
  ok: BRAND_COLORS.greenAccessible,
  warn: '#B8511A',
  err: '#C53030',
  pending: BRAND_COLORS.grayDark,

  // Dark panel (sidebar) — azul profundo de marca
  dark: BRAND_COLORS.blueDeep,
  darkAlt: BRAND_COLORS.blueDeepAlt,
  darkLine: BRAND_COLORS.blueDeepLight,

  // Paleta secundaria (charts, ilustraciones)
  accentPurple: SECONDARY_COLORS.purple,
  accentSky: SECONDARY_COLORS.skyBlue,
  accentYellow: SECONDARY_COLORS.yellow,
  accentPink: SECONDARY_COLORS.pink,
  accentTeal: SECONDARY_COLORS.teal,
}

export const F = {
  // Sans-serif moderna como sistema principal (alineado con material gráfico)
  sans: "'Inter', 'DM Sans', 'Nunito Sans', sans-serif",
  serif: "'Cormorant Garamond', 'Garamond', serif",
  mono: "'JetBrains Mono', 'DM Mono', 'Courier New', monospace",
}

// Breakpoints para diseño responsive
export const BREAKPOINTS = {
  mobile: 360,
  mobileLg: 428,
  tablet: 768,
  tabletLg: 1024,
  desktop: 1280,
  desktopLg: 1920,
}

// Spacing por dispositivo
export const SPACING = {
  mobile: { base: 4, gutter: 16, cardPadding: 16, section: 20 },
  tablet: { base: 6, gutter: 24, cardPadding: 20, section: 24 },
  desktop: { base: 8, gutter: 32, cardPadding: 24, section: 28 },
}

// Tipografía responsive
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

// Media queries como strings
export const MEDIA = {
  mobile: `@media (max-width: ${BREAKPOINTS.tablet - 1}px)`,
  tablet: `@media (min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.desktop - 1}px)`,
  desktop: `@media (min-width: ${BREAKPOINTS.desktop}px)`,
  mobileOnly: `@media (max-width: ${BREAKPOINTS.mobileLg}px)`,
  tabletUp: `@media (min-width: ${BREAKPOINTS.tablet}px)`,
  desktopUp: `@media (min-width: ${BREAKPOINTS.desktop}px)`,
}

export const TIERS = {
  free: {
    id: "free",
    name: "Free Vet",
    badge: "GRATIS",
    price: 0,
    priceCOP: 0,
    commission: 10,
    limit: 5,
    color: T.inkMuted,
    perks: [
      "5 servicios/mes",
      "Perfil básico verificado",
      "CTG · PSE · Transferencia",
    ],
  },
  pro: {
    id: "pro",
    name: "VetPro",
    badge: "PRO",
    price: 10,
    priceCOP: 42000,
    commission: 8,
    limit: null,
    color: T.sage,
    perks: [
      "Servicios ilimitados",
      "8% comisión por servicio",
      "Perfil destacado",
      "Chat prioritario",
      "Reportes mensuales",
    ],
  },
  elite: {
    id: "elite",
    name: "VetElite",
    badge: "ELITE",
    price: 20,
    priceCOP: 84000,
    commission: 3,
    limit: null,
    color: T.gold,
    perks: [
      "Servicios ilimitados",
      "3% comisión — la más baja",
      "Top de listado garantizado",
      "Insignia Elite verificada",
      "Analytics avanzado",
      "Chat VIP + soporte dedicado",
      "Acceso anticipado a features",
    ],
  },
}
