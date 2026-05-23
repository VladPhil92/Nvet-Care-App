/**
 * AppointmentTrackingScreen — "Veterinario en camino" (mockup oficial).
 *
 * Estructura del mockup:
 *   1. Header: arrow-back, título "En camino", link "Ayuda"
 *   2. Vet card: avatar + nombre + "Médico Veterinario" + rating + 2 round buttons (chat / phone)
 *      + barra "En camino a tu ubicación · Llegada estimada: X min"
 *   3. Mapa con ruta verde + pin auto (vet) + pin casa (cliente)
 *   4. Estado del servicio: 4 hitos circulares (Solicitado / En camino / En el lugar / Completado)
 *      con dots de progresión y timestamps
 *
 * Polling 15s con `refetchInterval` desactivado en COMPLETED/CANCELLED.
 */

import React, { useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon, type IconName } from '../../components/common/Icon'
import { RoutesBackground } from '../../components/patterns/BrandPatterns'
import { useAppointmentTrackingQuery } from '../../hooks/queries/useMobileQueries'
import { formatRelativeTime } from '../../utils/format'

interface Props {
  navigation: any
  route: { params: { id: string } }
}

type StepStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

interface Step {
  key: StepStatus
  label: string
  icon: IconName
}

const STEPS: Step[] = [
  { key: 'PENDING', label: 'Solicitado', icon: 'check' },
  { key: 'CONFIRMED', label: 'En camino', icon: 'location' },
  { key: 'IN_PROGRESS', label: 'En el lugar', icon: 'home' },
  { key: 'COMPLETED', label: 'Completado', icon: 'verified' },
]

export default function AppointmentTrackingScreen({ navigation, route }: Props) {
  const { id } = route.params
  const { data: appt, isPending, dataUpdatedAt } = useAppointmentTrackingQuery(id)

  const currentStepIndex = useMemo(() => {
    if (!appt) return 0
    const idx = STEPS.findIndex((s) => s.key === appt.status)
    return idx >= 0 ? idx : 0
  }, [appt])

  const handleChat = useCallback(() => {
    navigation.navigate('Chat', { appointmentId: id })
  }, [navigation, id])

  const handleCall = useCallback(() => {
    const phone = appt?.vet?.phone
    if (!phone) {
      Alert.alert('Sin teléfono', 'El veterinario no tiene número registrado.')
      return
    }
    const url = `tel:${phone.replace(/\s+/g, '')}`
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url)
      } else {
        Alert.alert('No disponible', 'Tu dispositivo no puede realizar llamadas.')
      }
    })
  }, [appt])

  const handleHelp = useCallback(() => {
    navigation.navigate('Help')
  }, [navigation])

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.sage} />
        </View>
      </SafeAreaView>
    )
  }

  const vet = appt?.vet
  const eta = appt?.etaMinutes ?? 18

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ── 1. Header ────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Icon name="arrow-back" size={24} color={Colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>En camino</Text>
        <Pressable
          onPress={handleHelp}
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel="Ayuda"
        >
          <Text style={styles.headerLink}>Ayuda</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 2. Vet card ────────────────────────────────────── */}
        <View style={styles.vetCard}>
          <View style={styles.vetCardTop}>
            <View style={styles.vetAvatar}>
              <Icon name="profile" size={32} color={Colors.sage} />
            </View>
            <View style={styles.vetInfo}>
              <View style={styles.vetNameRow}>
                <Text style={styles.vetName} numberOfLines={1}>
                  Dr. {vet?.firstName ?? 'Andrés'} {vet?.lastName ?? 'López'}
                </Text>
                <Icon name="verified" size={14} color={Colors.sage} />
              </View>
              <Text style={styles.vetRole}>Médico Veterinario</Text>
              <View style={styles.vetRating}>
                <Icon name="star" size={12} color={Colors.gold} />
                <Text style={styles.vetRatingText}>
                  {vet?.rating ?? '4.9'} ({vet?.reviewCount ?? '128'} reseñas)
                </Text>
              </View>
            </View>
            <View style={styles.vetActions}>
              <Pressable
                onPress={handleChat}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Chatear con el veterinario"
              >
                <Icon name="chat" size={20} color={Colors.sage} />
              </Pressable>
              <Pressable
                onPress={handleCall}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Llamar al veterinario"
              >
                <Icon name="phone" size={20} color={Colors.sage} />
              </Pressable>
            </View>
          </View>

          <View style={styles.etaStrip}>
            <View style={styles.etaIcon}>
              <Icon name="location" size={16} color={Colors.sage} />
            </View>
            <View style={styles.etaTextWrap}>
              <Text style={styles.etaTitle}>En camino a tu ubicación</Text>
              <Text style={styles.etaSubtitle}>Llegada estimada: {eta} min</Text>
            </View>
          </View>
        </View>

        {/* ── 3. Mapa con ruta ───────────────────────────────── */}
        <View style={styles.mapCard}>
          <RoutesBackground width={320} height={220} opacity={0.95} />
          <View style={styles.mapPinHome}>
            <Icon name="home" size={20} color={Colors.gold} />
          </View>
          <View style={styles.mapLabelTu}>
            <Text style={styles.mapLabelText}>Tu ubicación</Text>
          </View>
        </View>

        {/* ── 4. Status timeline (4 hitos) ───────────────────── */}
        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>Estado del servicio</Text>
          <View style={styles.timelineRow}>
            {STEPS.map((step, idx) => {
              const reached = idx <= currentStepIndex
              const isCurrent = idx === currentStepIndex
              const dotBg = reached ? Colors.sage : Colors.line
              const labelColor = reached ? Colors.sage : Colors.inkMuted

              return (
                <React.Fragment key={step.key}>
                  <View style={styles.stepCol}>
                    <View
                      style={[
                        styles.stepDot,
                        { backgroundColor: dotBg },
                        isCurrent && styles.stepDotCurrent,
                      ]}
                    >
                      <Icon
                        name={step.icon}
                        size={16}
                        color={reached ? '#FFFFFF' : Colors.inkMuted}
                      />
                    </View>
                    <Text style={[styles.stepLabel, { color: labelColor }]}>
                      {step.label}
                    </Text>
                    {isCurrent && appt && (
                      <Text style={styles.stepTime}>
                        {new Date(
                          appt.lastStatusChangeAt ?? appt.scheduledAt ?? Date.now(),
                        ).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    )}
                  </View>
                  {idx < STEPS.length - 1 && (
                    <View
                      style={[
                        styles.stepLine,
                        { backgroundColor: idx < currentStepIndex ? Colors.sage : Colors.line },
                      ]}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </View>
        </View>

        {/* Footer: actualizado hace X */}
        {dataUpdatedAt && (
          <View style={styles.footer}>
            <Icon name="check" size={12} color={Colors.inkMuted} />
            <Text style={styles.footerText}>
              Actualizado {formatRelativeTime(new Date(dataUpdatedAt))}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
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
  headerLink: {
    fontSize: 14,
    color: Colors.sageText,
    fontWeight: '600',
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    rowGap: 16,
  },

  // Vet card
  vetCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  vetCardTop: {
    flexDirection: 'row',
    columnGap: 12,
  },
  vetAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vetInfo: { flex: 1, justifyContent: 'center' },
  vetNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  vetName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
    flexShrink: 1,
  },
  vetRole: {
    fontSize: 12,
    color: Colors.inkSec,
    marginTop: 2,
  },
  vetRating: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    marginTop: 4,
  },
  vetRatingText: {
    fontSize: 12,
    color: Colors.inkMuted,
    fontWeight: '600',
  },
  vetActions: {
    flexDirection: 'row',
    columnGap: 8,
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ETA strip
  etaStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  etaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaTextWrap: { flex: 1 },
  etaTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.ink,
  },
  etaSubtitle: {
    fontSize: 12,
    color: Colors.sageText,
    fontWeight: '600',
    marginTop: 2,
  },

  // Mapa
  mapCard: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8F0EA',
    position: 'relative',
  },
  mapPinHome: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  mapLabelTu: {
    position: 'absolute',
    bottom: 35,
    right: 75,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  mapLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.ink,
  },

  // Timeline
  timelineCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 16,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepCol: {
    alignItems: 'center',
    width: 64,
  },
  stepDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotCurrent: {
    transform: [{ scale: 1.1 }],
    shadowColor: Colors.sage,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
    textAlign: 'center',
  },
  stepTime: {
    fontSize: 10,
    color: Colors.inkMuted,
    marginTop: 2,
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginTop: 17,
    marginHorizontal: -8,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    justifyContent: 'center',
    marginTop: 4,
  },
  footerText: {
    fontSize: 11,
    color: Colors.inkMuted,
  },
})
