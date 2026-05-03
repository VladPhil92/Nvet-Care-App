/**
 * Helpers de formateo centralizados para evitar duplicación.
 *
 * Diseño:
 *  - Usamos `Intl` cuando es posible (parte del runtime nativo de RN; no peso extra)
 *  - Locale fijo `es-CO` para consistencia (CRA: usuarios col, no se localiza dinámicamente aún)
 *  - Funciones puras y sin efectos colaterales
 */

const LOCALE = 'es-CO'

// ============================================================
// MONEDA
// ============================================================

/**
 * Formato COP sin decimales (los pesos colombianos no usan decimales en práctica).
 * `12500` → `"$12.500"`
 */
export function formatCOP(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return '—'
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Formato CTG: número con sufijo. `1500` → `"1.500 CTG"`
 */
export function formatCTG(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return '—'
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(
    amount,
  )} CTG`
}

/**
 * Formato compacto para KPIs grandes. `1_500_000` → `"$1,5M"`
 */
export function formatCOPCompact(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return '—'
  if (amount < 1000) return `$${amount}`
  if (amount < 1_000_000) return `$${(amount / 1000).toFixed(amount < 10_000 ? 1 : 0)}K`
  return `$${(amount / 1_000_000).toFixed(amount < 10_000_000 ? 1 : 0)}M`
}

// ============================================================
// DISTANCIA
// ============================================================

/**
 * `0.5` → `"500 m"`, `1.2` → `"1,2 km"`, `12.5` → `"13 km"`
 */
export function formatDistance(km: number | null | undefined): string {
  if (km == null || isNaN(km)) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`
  return `${Math.round(km)} km`
}

// ============================================================
// FECHAS
// ============================================================

const ONE_MIN = 60 * 1000
const ONE_HOUR = 60 * ONE_MIN
const ONE_DAY = 24 * ONE_HOUR

/**
 * `"hace 5 min"`, `"en 2 horas"`, `"hace 3 días"`, `"en 1 mes"`
 */
export function formatRelativeTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  const now = Date.now()
  const diff = d.getTime() - now
  const abs = Math.abs(diff)

  // Intl.RelativeTimeFormat puede no estar disponible en algunos engines mobile;
  // hacemos fallback manual si falta.
  const RTF = (Intl as any).RelativeTimeFormat
  if (typeof RTF === 'function') {
    const rtf = new RTF(LOCALE, { numeric: 'auto', style: 'long' })
    if (abs < ONE_MIN) return rtf.format(Math.round(diff / 1000), 'second')
    if (abs < ONE_HOUR) return rtf.format(Math.round(diff / ONE_MIN), 'minute')
    if (abs < ONE_DAY) return rtf.format(Math.round(diff / ONE_HOUR), 'hour')
    if (abs < 30 * ONE_DAY) return rtf.format(Math.round(diff / ONE_DAY), 'day')
    if (abs < 365 * ONE_DAY) return rtf.format(Math.round(diff / (30 * ONE_DAY)), 'month')
    return rtf.format(Math.round(diff / (365 * ONE_DAY)), 'year')
  }

  // Fallback simple
  const sign = diff < 0 ? 'hace' : 'en'
  if (abs < ONE_MIN) return diff < 0 ? 'justo ahora' : 'en un momento'
  if (abs < ONE_HOUR) return `${sign} ${Math.round(abs / ONE_MIN)} min`
  if (abs < ONE_DAY) return `${sign} ${Math.round(abs / ONE_HOUR)} h`
  return `${sign} ${Math.round(abs / ONE_DAY)} d`
}

/**
 * `"15 abr 2026"` o con hora si es hoy: `"hoy 15:30"`.
 */
export function formatAppointmentDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''

  const today = new Date()
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()

  if (isToday) {
    return `hoy ${d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ============================================================
// RATING
// ============================================================

/**
 * Renderiza estrellas como string. `4.5` → `"★★★★½"`, `3` → `"★★★☆☆"`
 */
export function formatRatingStars(rating: number, max = 5): string {
  const r = Math.max(0, Math.min(max, rating || 0))
  const full = Math.floor(r)
  const half = r - full >= 0.5 ? 1 : 0
  const empty = max - full - half
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty)
}

/**
 * Pluralización ES simple. `(2, 'cita', 'citas')` → `"2 citas"`
 */
export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}
