/**
 * Tests para los helpers de formato (`mobile/src/utils/format.ts`).
 *
 * Notar: el módulo usa `Intl` que está disponible en Node moderno.
 */

import {
  formatCOP,
  formatCOPCompact,
  formatCTG,
  formatDistance,
  formatRatingStars,
  pluralize,
} from '../../src/utils/format'

describe('formatCOP', () => {
  it('formats a basic amount with COP locale', () => {
    expect(formatCOP(12500)).toMatch(/\$/)
    expect(formatCOP(12500)).toContain('12')
    expect(formatCOP(12500)).toContain('500')
  })

  it('returns dash for null/undefined', () => {
    expect(formatCOP(null)).toBe('—')
    expect(formatCOP(undefined)).toBe('—')
    expect(formatCOP(NaN)).toBe('—')
  })

  it('handles zero', () => {
    expect(formatCOP(0)).toMatch(/\$.*0/)
  })
})

describe('formatCOPCompact', () => {
  it('formats small amounts as-is', () => {
    expect(formatCOPCompact(500)).toBe('$500')
  })

  it('formats thousands with K suffix', () => {
    expect(formatCOPCompact(50_000)).toBe('$50K')
    expect(formatCOPCompact(5_000)).toMatch(/\$5[.,]0K/)
  })

  it('formats millions with M suffix', () => {
    expect(formatCOPCompact(1_500_000)).toMatch(/\$1[.,]5M/)
    expect(formatCOPCompact(50_000_000)).toBe('$50M')
  })

  it('returns dash for null/undefined', () => {
    expect(formatCOPCompact(null)).toBe('—')
  })
})

describe('formatCTG', () => {
  it('formats CTG with suffix', () => {
    expect(formatCTG(1500)).toMatch(/CTG/)
    expect(formatCTG(1500)).toContain('1')
    expect(formatCTG(1500)).toContain('500')
  })

  it('returns dash for null/undefined', () => {
    expect(formatCTG(null)).toBe('—')
    expect(formatCTG(undefined)).toBe('—')
  })
})

describe('formatDistance', () => {
  it('formats distances < 1km in meters', () => {
    expect(formatDistance(0.5)).toBe('500 m')
    expect(formatDistance(0.123)).toBe('123 m')
  })

  it('formats distances 1-10km with 1 decimal', () => {
    expect(formatDistance(1.2)).toBe('1,2 km')
    expect(formatDistance(9.9)).toBe('9,9 km')
  })

  it('formats distances >= 10km without decimals', () => {
    expect(formatDistance(12.5)).toBe('13 km')
    expect(formatDistance(100)).toBe('100 km')
  })

  it('returns empty string for null/undefined', () => {
    expect(formatDistance(null)).toBe('')
    expect(formatDistance(undefined)).toBe('')
  })
})

describe('formatRatingStars', () => {
  it('renders 5 full stars for 5.0', () => {
    expect(formatRatingStars(5)).toBe('★★★★★')
  })

  it('renders 4 full + half for 4.5', () => {
    expect(formatRatingStars(4.5)).toBe('★★★★½')
  })

  it('renders empty stars for 0', () => {
    expect(formatRatingStars(0)).toBe('☆☆☆☆☆')
  })

  it('clamps values above max', () => {
    expect(formatRatingStars(10, 5)).toBe('★★★★★')
  })

  it('clamps negative values to 0', () => {
    expect(formatRatingStars(-1)).toBe('☆☆☆☆☆')
  })

  it('handles 3 as 3 full + 2 empty', () => {
    expect(formatRatingStars(3)).toBe('★★★☆☆')
  })
})

describe('pluralize', () => {
  it('uses singular for 1', () => {
    expect(pluralize(1, 'cita', 'citas')).toBe('1 cita')
  })

  it('uses plural for 0', () => {
    expect(pluralize(0, 'cita', 'citas')).toBe('0 citas')
  })

  it('uses plural for n > 1', () => {
    expect(pluralize(5, 'cita', 'citas')).toBe('5 citas')
    expect(pluralize(100, 'cita', 'citas')).toBe('100 citas')
  })
})
