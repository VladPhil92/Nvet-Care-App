/**
 * Nvet Care — Design Tokens
 * Migrado desde nvet-care-v4.jsx (T)
 * Paleta: Minimal Luxury · Sage + Ivory + Gold
 */

export const Colors = {
  // Neutrals — warm ivory / charcoal
  canvas:     '#F8F6F2',   // fondo principal
  surface:    '#FFFFFF',   // cards y paneles
  surfaceAlt: '#F2F0EB',   // inputs, fondo alternativo
  line:       '#E4E0D8',   // divisores
  lineHi:     '#CCC8BF',   // divisores importantes

  // Text hierarchy
  ink:        '#1A1915',   // texto primario
  inkSec:     '#6B6560',   // texto secundario
  inkMuted:   '#A8A49E',   // texto muted
  inkInv:     '#F8F6F2',   // texto sobre oscuro

  // Brand green — sage
  sage:       '#4A6741',
  sageLt:     '#6B8E62',
  sageFade:   'rgba(74,103,65,0.07)',

  // Gold — CTG accent
  gold:       '#B8962E',
  goldLt:     '#D4AF50',
  goldFade:   'rgba(184,150,46,0.06)',

  // Payments
  payPSE:     '#1A56DB',
  payTRF:     '#0F766E',
  payCTG:     '#B8962E',

  // Status
  ok:         '#2D7D46',
  warn:       '#92640A',
  err:        '#9B2323',
  pending:    '#6B5B00',

  // Dark panel (sidebar / wallet)
  dark:       '#1A1915',
  darkAlt:    '#252320',
  darkLine:   '#2E2B27',

  // Transparent overlays
  overlay:    'rgba(26,25,21,0.6)',
} as const;

export type ColorKey = keyof typeof Colors;
