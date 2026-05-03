/**
 * EmergencyScreen — "Emergencias 24/7" (mockup oficial).
 *
 * Estructura del mockup:
 *   1. Header con badge rojo "EMERGENCIAS 24/7"
 *   2. Hero rojo: "Atención veterinaria de emergencia" + subtítulo
 *   3. 3 features (Atención inmediata, Veterinarios cerca, Equipos preparados)
 *   4. CTAs: "Solicitar emergencia" (rojo sólido) + "Llamar ahora" (rojo outline)
 *   5. Stats card: "Disponible 24/7" + "Tiempo promedio 20-30 min"
 *   6. "¿Cuándo solicitar emergencia?" — 6 síntomas con iconos circulares rojos suaves
 *   7. Banner alert "Si tu mascota presenta..."
 *   8. "Consejos mientras llega el veterinario" — 5 tips
 *   9. Footer 4 garantías
 */

import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon, type IconName } from '../../components/common/Icon'

interface Props {
  navigation: any
}

// Paleta de emergencia (rojo del mockup)
const EMERGENCY = {
  red: '#EF4444',
  redDark: '#DC2626',
  redSoft: '#FEE2E2',
  redSofter: '#FFF5F5',
} as const

interface Symptom {
  icon: IconName
  label: string
}

const SYMPTOMS: Symptom[] = [
  { icon: 'heart', label: 'Dificultad para respirar' },
  { icon: 'lock', label: 'Convulsiones o desmayos' },
  { icon: 'check', label: 'Hemorragias' },
  { icon: 'history', label: 'Vómitos o diarrea severa' },
  { icon: 'shield', label: 'Accidentes o golpes fuertes' },
  { icon: 'star', label: 'Fiebre alta (>39.5 °C)' },
]

const TIPS = [
  'Mantén la calma y habla con voz tranquila.',
  'No le suministres medicamentos sin indicación.',
  'Si es posible, toma una foto o video del estado de tu mascota.',
  'Prepara un espacio cómodo y seguro para la atención.',
  'Ten a mano la cartilla de vacunación y antecedentes.',
]

interface FooterGuarantee {
  icon: IconName
  title: string
  body: string
}

const FOOTER: FooterGuarantee[] = [
  {
    icon: 'verified',
    title: 'Veterinarios verificados',
    body: 'Profesionales certificados y evaluados.',
  },
  {
    icon: 'history',
    title: 'Atención rápida y humana',
    body: 'Respuesta ágil con trato empático.',
  },
  {
    icon: 'lock',
    title: 'Información segura',
    body: 'Tus datos y los de tu mascota están protegidos.',
  },
  {
    icon: 'heart',
    title: 'Tu mascota, nuestra prioridad',
    body: 'Amor, cuidado y compromiso siempre.',
  },
]

export default function EmergencyScreen({ navigation }: Props) {
  const handleEmergency = useCallback(() => {
    Alert.alert(
      'Solicitar emergencia',
      '¿Confirmas que necesitas atención veterinaria de emergencia? Te conectaremos con el veterinario más cercano.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, solicitar',
          style: 'destructive',
          onPress: () =>
            navigation.navigate('Search', { service: 'EMERGENCY', priority: 'HIGH' }),
        },
      ],
    )
  }, [navigation])

  const handleCall = useCallback(() => {
    Linking.openURL('tel:+576015551234').catch(() => {
      Alert.alert('No se pudo iniciar la llamada', 'Marca manualmente: +57 601 555-1234')
    })
  }, [])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Icon name="arrow-back" size={24} color={Colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Emergencias</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Eyebrow badge rojo + título ─────────────────── */}
        <View style={styles.eyebrowBadge}>
          <Icon name="emergency" size={14} color={EMERGENCY.redDark} />
          <Text style={styles.eyebrowText}>EMERGENCIAS 24/7</Text>
        </View>

        <Text style={styles.heroTitle}>
          Atención veterinaria{'\n'}de emergencia
        </Text>
        <Text style={styles.heroSubtitle}>
          Estamos disponibles 24 horas, todos los días del año para cuidar a tu
          mascota cuando más nos necesita.
        </Text>

        {/* ── 2. 3 features destacados ────────────────────────── */}
        <View style={styles.featuresRow}>
          <FeatureItem
            icon="history"
            title="Atención inmediata"
            body="Respuesta rápida cuando cada minuto cuenta."
          />
          <FeatureItem
            icon="location"
            title="Veterinarios cerca"
            body="Te conectamos con el más cercano a tu ubicación."
          />
          <FeatureItem
            icon="services"
            title="Equipos preparados"
            body="Contamos con equipos y medicamentos para estabilizar."
          />
        </View>

        {/* ── 3. CTAs primarios ─────────────────────────────── */}
        <View style={styles.ctaRow}>
          <Pressable
            onPress={handleEmergency}
            style={({ pressed }) => [
              styles.ctaPrimary,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Solicitar atención veterinaria de emergencia"
          >
            <Icon name="emergency" size={20} color="#FFFFFF" />
            <Text style={styles.ctaPrimaryText}>Solicitar emergencia</Text>
          </Pressable>
          <Pressable
            onPress={handleCall}
            style={({ pressed }) => [
              styles.ctaSecondary,
              pressed && { backgroundColor: EMERGENCY.redSoft },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Llamar ahora a la línea de emergencia"
          >
            <Icon name="phone" size={18} color={EMERGENCY.redDark} />
            <Text style={styles.ctaSecondaryText}>Llamar ahora</Text>
          </Pressable>
        </View>

        <View style={styles.trustRow}>
          <Icon name="verified" size={14} color={Colors.sage} />
          <Text style={styles.trustText}>Profesionales verificados</Text>
          <Text style={styles.trustDivider}>·</Text>
          <Text style={styles.trustText}>Atención segura y confiable</Text>
        </View>

        {/* ── 4. Stats card ────────────────────────────────── */}
        <View style={styles.statsCard}>
          <View style={styles.statBox}>
            <View style={styles.statIconCircle}>
              <Icon name="emergency" size={18} color={EMERGENCY.redDark} />
            </View>
            <Text style={styles.statTitle}>Disponible 24/7</Text>
            <Text style={styles.statSubtitle}>365 días al año</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statTitle}>Tiempo promedio</Text>
            <Text style={[styles.statBig, { color: EMERGENCY.redDark }]}>
              20-30 min
            </Text>
            <Text style={styles.statFootnote}>*Según tu ubicación</Text>
          </View>
        </View>

        {/* ── 5. ¿Cuándo solicitar? ────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>¿Cuándo solicitar una emergencia?</Text>
          <View style={styles.symptomsGrid}>
            {SYMPTOMS.map((s) => (
              <View key={s.label} style={styles.symptomItem}>
                <View style={styles.symptomIconCircle}>
                  <Icon name={s.icon} size={22} color={EMERGENCY.redDark} />
                </View>
                <Text style={styles.symptomLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 6. Alert banner ──────────────────────────────── */}
        <View style={styles.alertBanner}>
          <Icon name="emergency" size={18} color={EMERGENCY.redDark} />
          <Text style={styles.alertText}>
            Si tu mascota presenta alguno de estos síntomas, actúa rápido.
            ¡Estamos para ayudarte!
          </Text>
        </View>

        {/* ── 7. Consejos mientras llega ───────────────────── */}
        <View style={styles.section}>
          <View style={styles.tipsHeader}>
            <Text style={styles.sectionTitle}>Consejos mientras llega el veterinario</Text>
            <View style={styles.tipsPaw}>
              <Icon name="heart" size={14} color={EMERGENCY.redDark} />
            </View>
          </View>
          <View style={styles.tipsList}>
            {TIPS.map((tip, idx) => (
              <View key={idx} style={styles.tipRow}>
                <View style={styles.tipBullet}>
                  <Icon name="check" size={12} color={EMERGENCY.redDark} />
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => navigation.navigate('Chat', { mode: 'support' })}
            style={styles.tipsChatLink}
            accessibilityRole="button"
            accessibilityLabel="Chatear con soporte"
          >
            <Icon name="phone" size={14} color={EMERGENCY.redDark} />
            <Text style={styles.tipsChatLinkText}>
              ¿Dudas? Chatea con nosotros en la app
            </Text>
          </Pressable>
        </View>

        {/* ── 8. Footer 4 garantías ────────────────────────── */}
        <View style={styles.footer}>
          {FOOTER.map((g) => (
            <View key={g.title} style={styles.footerItem}>
              <View style={styles.footerIcon}>
                <Icon name={g.icon} size={18} color={Colors.sage} />
              </View>
              <Text style={styles.footerTitle}>{g.title}</Text>
              <Text style={styles.footerBody}>{g.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-componente: feature item ──────────────────────────────
function FeatureItem({
  icon,
  title,
  body,
}: {
  icon: IconName
  title: string
  body: string
}) {
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIconCircle}>
        <Icon name={icon} size={20} color={EMERGENCY.redDark} />
      </View>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureBody}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.ink,
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 32,
    rowGap: 18,
  },

  // Eyebrow badge
  eyebrowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    backgroundColor: EMERGENCY.redSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '800',
    color: EMERGENCY.redDark,
    letterSpacing: 1,
  },

  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.ink,
    lineHeight: 36,
  },
  heroSubtitle: {
    fontSize: 14,
    color: Colors.inkSec,
    lineHeight: 20,
  },

  // Features
  featuresRow: {
    flexDirection: 'row',
    columnGap: 8,
  },
  featureItem: {
    flex: 1,
    rowGap: 6,
    paddingVertical: 4,
  },
  featureIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: EMERGENCY.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.ink,
  },
  featureBody: {
    fontSize: 11,
    color: Colors.inkSec,
    lineHeight: 14,
  },

  // CTAs
  ctaRow: {
    flexDirection: 'row',
    columnGap: 10,
  },
  ctaPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    backgroundColor: EMERGENCY.red,
    paddingVertical: 14,
    borderRadius: 100,
  },
  ctaPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  ctaSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    backgroundColor: Colors.surface,
    paddingVertical: 14,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: EMERGENCY.red,
  },
  ctaSecondaryText: {
    color: EMERGENCY.redDark,
    fontSize: 14,
    fontWeight: '800',
  },

  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  trustText: {
    fontSize: 12,
    color: Colors.inkSec,
    fontWeight: '600',
  },
  trustDivider: {
    color: Colors.inkMuted,
    fontWeight: '700',
  },

  // Stats card
  statsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  statBox: { flex: 1, rowGap: 4 },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: EMERGENCY.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink,
  },
  statSubtitle: {
    fontSize: 11,
    color: Colors.inkSec,
  },
  statBig: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  statFootnote: {
    fontSize: 10,
    color: EMERGENCY.redDark,
    fontStyle: 'italic',
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.line,
    marginHorizontal: 12,
  },

  // Section general
  section: { rowGap: 12 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink,
  },

  // Symptoms grid
  symptomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 14,
  },
  symptomItem: {
    width: '31%',
    alignItems: 'center',
    rowGap: 6,
  },
  symptomIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: EMERGENCY.redSofter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symptomLabel: {
    fontSize: 11,
    color: Colors.ink,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },

  // Alert banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: 10,
    backgroundColor: EMERGENCY.redSoft,
    padding: 14,
    borderRadius: 12,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    color: EMERGENCY.redDark,
    fontWeight: '600',
    lineHeight: 18,
  },

  // Tips
  tipsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tipsPaw: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: EMERGENCY.redSofter,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsList: {
    rowGap: 10,
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  tipRow: {
    flexDirection: 'row',
    columnGap: 10,
  },
  tipBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: EMERGENCY.redSofter,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: Colors.ink,
    lineHeight: 18,
  },
  tipsChatLink: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  tipsChatLinkText: {
    fontSize: 13,
    color: EMERGENCY.redDark,
    fontWeight: '700',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 12,
    marginTop: 8,
  },
  footerItem: {
    width: '47%',
    rowGap: 4,
  },
  footerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  footerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.ink,
  },
  footerBody: {
    fontSize: 11,
    color: Colors.inkSec,
    lineHeight: 14,
  },
})
