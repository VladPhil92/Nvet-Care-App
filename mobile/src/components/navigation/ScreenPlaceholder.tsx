import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/**
 * ScreenPlaceholder — componente reutilizable mientras las pantallas
 * complejas (SearchVets, AppointmentsList, ScheduleScreen, etc.) son
 * desarrolladas en sprints siguientes.
 *
 * Mantiene la marca y a11y, pero comunica honestamente que la
 * funcionalidad no está disponible aún.
 */

const COLORS = {
  sage: '#5B7553',
  gold: '#C9A961',
  bg: '#FAFAF7',
  text: '#1F2A1B',
  muted: '#5F6B5A',
  border: '#E5E2D8',
} as const

interface Props {
  title: string
  subtitle?: string
  glyph?: string
  accent?: 'sage' | 'gold'
  comingSoon?: boolean
}

export default function ScreenPlaceholder({
  title,
  subtitle,
  glyph = '✦',
  accent = 'sage',
  comingSoon = true,
}: Props) {
  const accentColor = accent === 'sage' ? COLORS.sage : COLORS.gold
  const accentBg = accent === 'sage' ? '#5B75531a' : '#C9A9611a'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.brand}>Nvet Care</Text>

        <View style={[styles.card, { backgroundColor: accentBg, borderColor: accentColor }]}>
          <Text style={[styles.glyph, { color: accentColor }]}>{glyph}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {comingSoon && (
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text style={styles.badgeText}>Próximamente</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flexGrow: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 14, fontWeight: '700', color: COLORS.muted, marginBottom: 32 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  glyph: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
})
