import { Colors } from './colors'
import { Dimensions, Platform } from 'react-native'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

/**
 * Typography Scale
 */
export const Typography = {
  serif: Platform.select({
    ios: 'Georgia',
    android: 'serif',
  }),
  sans: Platform.select({
    ios: 'System',
    android: 'Roboto',
  }),
  mono: Platform.select({
    ios: 'Courier',
    android: 'monospace',
  }),
} as const

/**
 * Spacing System
 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  gutter: 16,
} as const

/**
 * Border Radius
 */
export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const

/**
 * Font Sizes - Responsive
 */
const getResponsiveFontSize = () => {
  if (SCREEN_WIDTH < 375) {
    // iPhone SE
    return {
      h1: 24,
      h2: 20,
      h3: 16,
      body: 14,
      small: 12,
      tiny: 10,
    }
  } else if (SCREEN_WIDTH < 414) {
    // iPhone Standard
    return {
      h1: 28,
      h2: 22,
      h3: 17,
      body: 15,
      small: 13,
      tiny: 11,
    }
  } else {
    // iPhone Pro Max / iPad
    return {
      h1: 32,
      h2: 24,
      h3: 18,
      body: 16,
      small: 14,
      tiny: 12,
    }
  }
}

export const FontSize = getResponsiveFontSize()

/**
 * Touch Targets (mínimo 44x44 pts iOS / 48x48 dp Android)
 */
export const TouchTarget = {
  minSize: Platform.OS === 'ios' ? 44 : 48,
}

/**
 * Tiers System
 */
export const TIERS = {
  free: {
    id: 'free',
    name: 'Free Vet',
    badge: 'GRATIS',
    price: 0,
    priceCOP: 0,
    commission: 10,
    limit: 5,
    color: Colors.inkMuted,
    perks: ['5 servicios/mes', 'Perfil básico verificado', 'CTG · PSE · Transferencia'],
  },
  pro: {
    id: 'pro',
    name: 'VetPro',
    badge: 'PRO',
    price: 10,
    priceCOP: 42000,
    commission: 8,
    limit: null,
    color: Colors.sage,
    perks: [
      'Servicios ilimitados',
      '8% comisión por servicio',
      'Perfil destacado',
      'Chat prioritario',
      'Reportes mensuales',
    ],
  },
  elite: {
    id: 'elite',
    name: 'VetElite',
    badge: 'ELITE',
    price: 20,
    priceCOP: 84000,
    commission: 3,
    limit: null,
    color: Colors.gold,
    perks: [
      'Servicios ilimitados',
      '3% comisión — la más baja',
      'Top de listado garantizado',
      'Insignia Elite verificada',
      'Analytics avanzado',
      'Chat VIP + soporte dedicado',
      'Acceso anticipado a features',
    ],
  },
} as const

/**
 * Shadows
 */
export const Shadow = {
  sm: {
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
} as const

export { Colors }
