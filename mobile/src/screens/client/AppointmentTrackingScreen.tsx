import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native'
import MapView, { Marker, Region } from 'react-native-maps'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon, type IconName } from '../../components/common/Icon'
import { useAppointmentTrackingQuery } from '../../hooks/queries/useMobileQueries'
import { formatRelativeTime } from '../../utils/format'
import liveLocationService, {
  Coordinates,
  LiveLocationResponse,
} from '../../services/live-location.service'

interface Props {
  navigation: any
  route: { params: { id: string } }
}

type StepStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'

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

// Bocagrande, Cartagena de Indias. Se usa solo si todavía no hay GPS.
const CARTAGENA_FALLBACK: Region = {
  latitude: 10.4003,
  longitude: -75.5594,
  latitudeDelta: 0.035,
  longitudeDelta: 0.035,
}

function haversineKm(a: Coordinates, b: Coordinates): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthKm = 6371
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earthKm * Math.asin(Math.sqrt(h))
}

function regionFor(
  client: Coordinates | null,
  vet: Coordinates | null,
): Region {
  if (client && vet) {
    const latitude = (client.latitude + vet.latitude) / 2
    const longitude = (client.longitude + vet.longitude) / 2
    const latitudeDelta = Math.max(
      Math.abs(client.latitude - vet.latitude) * 1.8,
      0.012,
    )
    const longitudeDelta = Math.max(
      Math.abs(client.longitude - vet.longitude) * 1.8,
      0.012,
    )
    return { latitude, longitude, latitudeDelta, longitudeDelta }
  }

  const single = client ?? vet
  if (single) {
    return {
      latitude: single.latitude,
      longitude: single.longitude,
      latitudeDelta: 0.018,
      longitudeDelta: 0.018,
    }
  }

  return CARTAGENA_FALLBACK
}

export default function AppointmentTrackingScreen({ navigation, route }: Props) {
  const { id } = route.params
  const { data: appt, isPending, dataUpdatedAt } = useAppointmentTrackingQuery(id)
  const [clientLocation, setClientLocation] = useState<Coordinates | null>(null)
  const [live, setLive] = useState<LiveLocationResponse | null>(null)

  useEffect(() => {
    let mounted = true
    liveLocationService
      .getDeviceCoordinates()
      .then((coords) => {
        if (mounted) setClientLocation(coords)
      })
      .catch(() => {
        if (mounted) setClientLocation(null)
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    let timer: ReturnType<typeof setInterval> | undefined

    const refresh = async () => {
      try {
        const result = await liveLocationService.getAppointmentLiveLocation(id)
        if (mounted) setLive(result)
      } catch {
        // El polling de tracking base sigue activo. Un fallo temporal de GPS no
        // debe tumbar toda la pantalla.
      }
    }

    void refresh()
    timer = setInterval(refresh, 15_000)

    return () => {
      mounted = false
      if (timer) clearInterval(timer)
    }
  }, [id])

  const status = (live?.status ?? appt?.status ?? appt?.currentStatus ?? 'PENDING') as StepStatus

  const currentStepIndex = useMemo(() => {
    const idx = STEPS.findIndex((step) => step.key === status)
    return idx >= 0 ? idx : 0
  }, [status])

  const vetLocation = live?.vetLocation ?? null
  const mapRegion = useMemo(
    () => regionFor(clientLocation, vetLocation),
    [clientLocation, vetLocation],
  )

  const distanceKm = useMemo(() => {
    if (!clientLocation || !vetLocation) return null
    return haversineKm(clientLocation, vetLocation)
  }, [clientLocation, vetLocation])

  const handleChat = useCallback(() => {
    navigation.navigate('Chat', { appointmentId: id })
  }, [navigation, id])

  const handleCall = useCallback(() => {
    const phone = live?.vet?.phone
    if (phone) void Linking.openURL(`tel:${phone}`)
  }, [live?.vet?.phone])

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

  const vet = live?.vet ?? appt?.vet
  const trackingMessage = !live?.trackingActive
    ? 'El tracking se activa cuando la cita está confirmada.'
    : !vetLocation
      ? 'Esperando la primera ubicación del veterinario.'
      : live.isStale
        ? 'La última ubicación tiene más de 2 minutos.'
        : distanceKm !== null
          ? `Distancia aproximada: ${distanceKm.toFixed(1)} km`
          : 'Ubicación del veterinario actualizada.'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Icon name="arrow-back" size={24} color={Colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Seguimiento</Text>
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
        <View style={styles.vetCard}>
          <View style={styles.vetCardTop}>
            <View style={styles.vetAvatar}>
              <Icon name="profile" size={32} color={Colors.sage} />
            </View>
            <View style={styles.vetInfo}>
              <View style={styles.vetNameRow}>
                <Text style={styles.vetName} numberOfLines={1}>
                  Dr. {vet?.firstName ?? ''} {vet?.lastName ?? ''}
                </Text>
                <Icon name="verified" size={14} color={Colors.sage} />
              </View>
              <Text style={styles.vetRole}>Médico Veterinario</Text>
              <Text style={styles.trackingText}>{trackingMessage}</Text>
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
                disabled={!live?.vet?.phone}
                style={styles.iconButton}
                accessibilityRole="button"
                accessibilityLabel="Llamar al veterinario"
              >
                <Icon name="phone" size={20} color={Colors.sage} />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.mapCard}>
          <MapView
            style={StyleSheet.absoluteFill}
            region={mapRegion}
            showsCompass
            showsBuildings
            showsPointsOfInterest
            toolbarEnabled={false}
          >
            {clientLocation && (
              <Marker
                coordinate={clientLocation}
                title="Tu ubicación"
                description="Ubicación aproximada del cliente"
                pinColor="#D69B2D"
              />
            )}
            {vetLocation && (
              <Marker
                coordinate={vetLocation}
                title="Veterinario"
                description={live?.isStale ? 'Ubicación desactualizada' : 'Ubicación reciente'}
                pinColor="#4F7D65"
              />
            )}
          </MapView>
          {!clientLocation && !vetLocation && (
            <View style={styles.mapFallbackLabel}>
              <Text style={styles.mapFallbackTitle}>Cartagena de Indias</Text>
              <Text style={styles.mapFallbackText}>
                Vista inicial: Bocagrande. Activa ubicación para centrar el mapa.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.mapNotice}>
          <Icon name="location" size={14} color={Colors.inkMuted} />
          <Text style={styles.mapNoticeText}>
            El mapa muestra posiciones reales. La ruta vial y el ETA se habilitarán
            únicamente cuando exista un proveedor de routing; no se dibujan líneas
            aproximadas que puedan atravesar agua o zonas no transitables.
          </Text>
        </View>

        <View style={styles.timelineCard}>
          <Text style={styles.timelineTitle}>Estado del servicio</Text>
          <View style={styles.timelineRow}>
            {STEPS.map((step, idx) => {
              const reached = idx <= currentStepIndex
              const isCurrent = idx === currentStepIndex
              return (
                <React.Fragment key={step.key}>
                  <View style={styles.stepCol}>
                    <View
                      style={[
                        styles.stepDot,
                        { backgroundColor: reached ? Colors.sage : Colors.line },
                        isCurrent && styles.stepDotCurrent,
                      ]}
                    >
                      <Icon
                        name={step.icon}
                        size={16}
                        color={reached ? '#FFFFFF' : Colors.inkMuted}
                      />
                    </View>
                    <Text
                      style={[
                        styles.stepLabel,
                        { color: reached ? Colors.sage : Colors.inkMuted },
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                  {idx < STEPS.length - 1 && (
                    <View
                      style={[
                        styles.stepLine,
                        {
                          backgroundColor:
                            idx < currentStepIndex ? Colors.sage : Colors.line,
                        },
                      ]}
                    />
                  )}
                </React.Fragment>
              )
            })}
          </View>
        </View>

        {(live?.locationUpdatedAt || dataUpdatedAt) && (
          <View style={styles.footer}>
            <Icon name="check" size={12} color={Colors.inkMuted} />
            <Text style={styles.footerText}>
              Actualizado{' '}
              {formatRelativeTime(
                new Date(live?.locationUpdatedAt ?? dataUpdatedAt),
              )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  headerLink: { fontSize: 14, color: Colors.sageText, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 40, rowGap: 16 },
  vetCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  vetCardTop: { flexDirection: 'row', columnGap: 12, alignItems: 'center' },
  vetAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vetInfo: { flex: 1 },
  vetNameRow: { flexDirection: 'row', alignItems: 'center', columnGap: 6 },
  vetName: { fontSize: 16, fontWeight: '700', color: Colors.ink, flexShrink: 1 },
  vetRole: { fontSize: 12, color: Colors.inkSec, marginTop: 2 },
  trackingText: { fontSize: 12, color: Colors.sageText, marginTop: 5, lineHeight: 17 },
  vetActions: { flexDirection: 'row', columnGap: 8 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCard: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8F0EA',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  mapFallbackLabel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  mapFallbackTitle: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  mapFallbackText: { fontSize: 11, color: Colors.inkMuted, marginTop: 3 },
  mapNotice: {
    flexDirection: 'row',
    columnGap: 8,
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  mapNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: Colors.inkMuted,
  },
  timelineCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  timelineTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 16 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepCol: { alignItems: 'center', width: 64 },
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
  stepLabel: { fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  stepLine: { flex: 1, height: 2, marginTop: 17, marginHorizontal: -8 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    justifyContent: 'center',
  },
  footerText: { fontSize: 11, color: Colors.inkMuted },
})
