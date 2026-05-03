/**
 * Nvet Care — Design Tokens (paleta oficial)
 *
 * Fuente: brand kit oficial entregado en /public/images/Corporative Images/.
 * Paleta: Azul Profundo + Verde Principal + Naranja Acento + Grises neutros.
 *
 * IMPORTANTE: los nombres (Colors.sage, Colors.gold, Colors.dark, etc.) se
 * mantienen por compatibilidad con el resto del codebase. Lo que cambia son
 * los HEX codes a los oficiales.
 *
 * Mapping conceptual:
 *   sage     → Verde Principal #34B27A (antes era sage opaco #5B7553)
 *   gold     → Naranja Acento  #FF8A3D (antes era gold #C9A961)
 *   dark     → Azul Profundo   #0D1B2A (antes era charcoal #1A1915)
 *   canvas   → Gris Claro      #F2F4F7 (antes era ivory #F8F6F2)
 */

export const Colors = {
  // Neutrals (paleta oficial)
  canvas:     '#F2F4F7',   // fondo principal (Gris Claro)
  surface:    '#FFFFFF',   // cards y paneles
  surfaceAlt: '#FAFBFC',   // inputs, fondo alternativo
  line:       '#E5E8ED',   // divisores
  lineHi:     '#D5D9E0',   // divisores importantes

  // Text hierarchy (sobre canvas claro)
  ink:        '#0D1B2A',   // texto primario — Azul Profundo
  inkSec:     '#333A40',   // texto secundario — Gris Oscuro
  inkMuted:   '#454D54',   // texto muted (AAA — 4.5:1+)
  inkInv:     '#FFFFFF',   // texto sobre oscuro

  // Brand green — Verde Principal (oficial)
  sage:       '#34B27A',   // Verde Principal
  sageLt:     '#B7E4C7',   // Verde Claro — acento suave
  sageDark:   '#268A5C',   // hover / active state
  sageText:   '#1E7048',   // texto verde con contraste AAA sobre canvas
  sageFade:   'rgba(52,178,122,0.08)',

  // Verde Claro — cards saludables, badges suaves
  greenSoft:    '#B7E4C7',
  greenSoftAlt: '#D5F0DD',

  // Naranja Acento (alias gold mantenido por compat)
  gold:       '#FF8A3D',   // Naranja Acento
  goldLt:     '#FFB07A',
  goldDark:   '#E66A1A',
  goldText:   '#B8511A',   // naranja oscurecido para texto (large only)
  goldFade:   'rgba(255,138,61,0.08)',

  // Payments
  payPSE:     '#1A56DB',
  payTRF:     '#0F766E',
  payCTG:     '#FF8A3D',

  // Status
  ok:         '#1E7048',
  warn:       '#B8511A',
  err:        '#C53030',
  pending:    '#333A40',

  // Dark panel (sidebar / wallet) — Azul Profundo
  dark:       '#0D1B2A',
  darkAlt:    '#162536',
  darkLine:   '#1F3349',

  // Paleta secundaria (charts, ilustraciones)
  accentPurple: '#7B6FF6',
  accentSky:    '#6EC1F4',
  accentYellow: '#FFD97A',
  accentPink:   '#FF8FA3',
  accentTeal:   '#2EC4B6',

  // Transparent overlays
  overlay:    'rgba(13,27,42,0.6)',
} as const;

export type ColorKey = keyof typeof Colors;
