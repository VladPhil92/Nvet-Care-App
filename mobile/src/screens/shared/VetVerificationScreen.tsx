/**
 * VetVerificationScreen — "Sistema de verificación" (mockup oficial).
 *
 * Estructura del mockup:
 *   1. Header hero: título + subtítulo verde claro
 *   2. Hero card "Confianza que se construye, cuidado que se merece"
 *   3. 6 pasos circulares con conector progresivo:
 *      Identidad → Formación → Licencias → Antecedentes → Seguro → Aprobación
 *   4. Insignias verificadas (6 badges con iconos)
 *   5. Credenciales verificadas (lista de 5 documentos con check)
 *   6. Garantías para ti y tu mascota (5 cards en grid)
 *   7. CTA contextual según status (apply / view / re-apply)
 */

import React, { useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon, type IconName } from '../../components/common/Icon'
import { useMyVerificationStatusQuery } from '../../hooks/queries/useMobileQueries'

interface Props {
  navigation: any
}

type VStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'

interface Step {
  id: number
  icon: IconName
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    id: 1,
    icon: 'profile',
    title: 'Identidad',
    description: 'Verificamos tu identidad con documentos oficiales.',
  },
  {
    id: 2,
    icon: 'medal',
    title: 'Formación',
    description: 'Validamos títulos universitarios y especializaciones.',
  },
  {
    id: 3,
    icon: 'history',
    title: 'Licencias',
    description: 'Confirmamos la licencia profesional vigente.',
  },
  {
    id: 4,
    icon: 'shield',
    title: 'Antecedentes',
    description: 'Revisamos antecedentes judiciales y disciplinarios.',
  },
  {
    id: 5,
    icon: 'lock',
    title: 'Seguro',
    description: 'Verificamos seguro de responsabilidad civil profesional.',
  },
  {
    id: 6,
    icon: 'verified',
    title: 'Aprobación',
    description: 'Evaluamos tu perfil y lo aprobamos en la plataforma.',
  },
]

interface Guarantee {
  icon: IconName
  title: string
  body: string
}

const GUARANTEES: Guarantee[] = [
  {
    icon: 'shield',
    title: 'Profesionales confiables',
    body: 'Solo trabajamos con veterinarios verificados.',
  },
  {
    icon: 'lock',
    title: 'Información segura',
    body: 'Tus datos y los de tu mascota están protegidos.',
  },
  {
    icon: 'verified',
    title: 'Atención de calidad',
    body: 'Evaluamos continuamente la calidad del servicio.',
  },
  {
    icon: 'headset',
    title: 'Soporte siempre contigo',
    body: 'Te acompañamos antes, durante y después de cada atención.',
  },
  {
    icon: 'heart',
    title: 'Tu tranquilidad, nuestra prioridad',
    body: 'Cuidamos de quienes cuidas.',
  },
]

const CREDENTIALS = [
  'Documento de identidad',
  'Título profesional validado',
  'Licencia profesional vigente',
  'Antecedentes judiciales verificados',
  'Seguro de responsabilidad civil',
]

export default function VetVerificationScreen({ navigation }: Props) {
  const verificationQ = useMyVerificationStatusQuery()
  const status = (verificationQ.data?.status ?? 'NONE') as VStatus

  // El step "actual" se deriva del estado: APPROVED = 6, PENDING = 4, NONE = 0
  const currentStep = useMemo(() => {
    if (status === 'APPROVED') return 6
    if (status === 'REJECTED') return 0
    if (status === 'PENDING') return 4
    return 0
  }, [status])

  if (verificationQ.isPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.sage} />
        </View>
      </SafeAreaView>
    )
  }

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
        <Text style={styles.headerTitle}>Verificación</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Hero ───────────────────────────────────────── */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Sistema de verificación</Text>
          <Text style={styles.heroTitle}>
            Confianza que se construye,{'\n'}cuidado que se merece.
          </Text>
          <Text style={styles.heroSubtitle}>
            Todos nuestros veterinarios pasan por un riguroso proceso de
            verificación para garantizar la seguridad y bienestar de tu
            mascota.
          </Text>
        </View>

        {/* ── 2. Status badge ───────────────────────────────── */}
        <StatusBadge status={status} />

        {/* ── 3. 6 pasos del proceso ───────────────────────── */}
        <View style={styles.stepsCard}>
          <Text style={styles.sectionTitle}>Así verificamos a cada veterinario</Text>
          <View style={styles.stepsList}>
            {STEPS.map((step, idx) => {
              const reached = step.id <= currentStep
              const isLast = idx === STEPS.length - 1
              return (
                <View key={step.id} style={styles.stepRow}>
                  <View style={styles.stepCircleCol}>
                    <View
                      style={[
                        styles.stepCircle,
                        reached && styles.stepCircleReached,
                      ]}
                    >
                      <Icon
                        name={step.icon}
                        size={20}
                        color={reached ? '#FFFFFF' : Colors.inkMuted}
                      />
                    </View>
                    {!isLast && (
                      <View
                        style={[
                          styles.stepConnector,
                          {
                            backgroundColor:
                              step.id < currentStep ? Colors.sage : Colors.line,
                          },
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.stepBody}>
                    <View style={styles.stepHeaderRow}>
                      <Text style={styles.stepNumber}>{step.id}</Text>
                      <Text style={styles.stepTitle}>{step.title}</Text>
                      {reached && (
                        <View style={styles.stepCheck}>
                          <Icon name="check" size={12} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.stepDescription}>{step.description}</Text>
                  </View>
                </View>
              )
            })}
          </View>

          <View style={styles.commitmentBanner}>
            <Icon name="shield" size={18} color={Colors.sage} />
            <Text style={styles.commitmentText}>
              Solo los veterinarios que cumplen con el 100% de estos pasos pueden
              ofrecer sus servicios en Nvet Care.
            </Text>
          </View>
        </View>

        {/* ── 4. Insignias verificadas ──────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Insignias que garantizan confianza</Text>
          <View style={styles.badgesGrid}>
            {STEPS.map((step) => (
              <View key={step.id} style={styles.badgeItem}>
                <View style={styles.badgeIcon}>
                  <Icon name={step.icon} size={22} color={Colors.sage} />
                </View>
                <Text style={styles.badgeLabel}>
                  {step.title} verificada
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 5. Credenciales verificadas ───────────────────── */}
        {status === 'APPROVED' && (
          <View style={styles.credentialsCard}>
            <Text style={styles.sectionTitle}>Credenciales verificadas</Text>
            {CREDENTIALS.map((c) => (
              <View key={c} style={styles.credentialRow}>
                <Icon name="check" size={16} color={Colors.sage} />
                <Text style={styles.credentialText}>{c}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 6. Garantías ─────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Garantías para ti y tu mascota</Text>
          <View style={styles.guaranteesGrid}>
            {GUARANTEES.map((g) => (
              <View key={g.title} style={styles.guaranteeCard}>
                <View style={styles.guaranteeIcon}>
                  <Icon name={g.icon} size={20} color={Colors.sage} />
                </View>
                <Text style={styles.guaranteeTitle}>{g.title}</Text>
                <Text style={styles.guaranteeBody}>{g.body}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 7. CTA según status ──────────────────────────── */}
        {status === 'NONE' && (
          <Pressable
            onPress={() => navigation.navigate('UploadVerificationDocs')}
            style={({ pressed }) => [
              styles.cta,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Iniciar verificación"
          >
            <Text style={styles.ctaText}>Iniciar verificación</Text>
            <Icon name="arrow-right" size={18} color="#FFFFFF" />
          </Pressable>
        )}
        {status === 'REJECTED' && (
          <Pressable
            onPress={() => navigation.navigate('UploadVerificationDocs')}
            style={[styles.cta, styles.ctaWarn]}
            accessibilityRole="button"
            accessibilityLabel="Volver a aplicar"
          >
            <Text style={styles.ctaText}>Volver a aplicar</Text>
            <Icon name="arrow-right" size={18} color="#FFFFFF" />
          </Pressable>
        )}

        {/* Footer "Confianza que se ve, se siente y se demuestra" */}
        <View style={styles.footerBanner}>
          <Icon name="shield" size={20} color={Colors.sage} />
          <Text style={styles.footerBannerText}>
            Confianza que se ve, se siente y se demuestra.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ── Sub-componente: badge de estado ──────────────────────────
function StatusBadge({ status }: { status: VStatus }) {
  const config = {
    NONE: {
      label: 'Sin iniciar',
      color: Colors.inkMuted,
      bg: Colors.surfaceAlt,
      icon: 'plus' as IconName,
    },
    PENDING: {
      label: 'En revisión',
      color: Colors.gold,
      bg: '#FFE4D2',
      icon: 'history' as IconName,
    },
    APPROVED: {
      label: 'Perfil verificado',
      color: Colors.sage,
      bg: Colors.greenSoft,
      icon: 'verified' as IconName,
    },
    REJECTED: {
      label: 'Rechazado',
      color: Colors.err,
      bg: '#FEE2E2',
      icon: 'close' as IconName,
    },
  }
  const c = config[status]
  return (
    <View style={[styles.statusBadge, { backgroundColor: c.bg }]}>
      <Icon name={c.icon} size={16} color={c.color} />
      <Text style={[styles.statusBadgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  // Hero
  hero: {
    rowGap: 8,
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.sage,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.ink,
    lineHeight: 32,
  },
  heroSubtitle: {
    fontSize: 14,
    color: Colors.inkSec,
    lineHeight: 20,
    marginTop: 4,
  },

  // Status badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Sections + steps
  section: { rowGap: 12 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  stepsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.line,
    rowGap: 14,
  },
  stepsList: {
    rowGap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    columnGap: 14,
  },
  stepCircleCol: {
    alignItems: 'center',
    width: 44,
  },
  stepCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleReached: {
    backgroundColor: Colors.sage,
  },
  stepConnector: {
    width: 2,
    flex: 1,
    minHeight: 24,
    marginVertical: 2,
  },
  stepBody: {
    flex: 1,
    paddingBottom: 18,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 4,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.inkMuted,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 22,
    textAlign: 'center',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.ink,
    flex: 1,
  },
  stepCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDescription: {
    fontSize: 13,
    color: Colors.inkSec,
    lineHeight: 18,
  },

  commitmentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    backgroundColor: Colors.greenSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  commitmentText: {
    flex: 1,
    fontSize: 12,
    color: Colors.ink,
    fontWeight: '600',
    lineHeight: 16,
  },

  // Badges grid
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 12,
  },
  badgeItem: {
    width: '31%',
    alignItems: 'center',
    rowGap: 6,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: 14,
  },

  // Credentials
  credentialsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    rowGap: 10,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  credentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  credentialText: {
    fontSize: 14,
    color: Colors.ink,
    fontWeight: '500',
  },

  // Guarantees
  guaranteesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 12,
  },
  guaranteeCard: {
    width: '47%',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    rowGap: 6,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  guaranteeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  guaranteeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.ink,
  },
  guaranteeBody: {
    fontSize: 11,
    color: Colors.inkSec,
    lineHeight: 14,
  },

  // CTA
  cta: {
    flexDirection: 'row',
    backgroundColor: Colors.sage,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
  },
  ctaWarn: {
    backgroundColor: Colors.gold,
  },
  ctaText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },

  // Footer banner
  footerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    backgroundColor: Colors.greenSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  footerBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink,
  },
})
