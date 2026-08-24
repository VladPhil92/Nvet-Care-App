import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import MapView, { Marker, Region } from 'react-native-maps'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAppointmentDetailQuery } from '../../hooks/queries/useMobileQueries'
import liveLocationService, {
  Coordinates,
} from '../../services/live-location.service'
import { UI_COLORS, Badge, Button, Card } from '../../components/ui/primitives'

interface Props {
  navigation: any
  route: { params: { appointmentId: string } }
}

const CARTAGENA_FALLBACK: Region = {
  latitude: 10.4003,
  longitude: -75.5594,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
}

export default function VetAppointmentDetailScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params
  const appointmentQuery = useAppointmentDetailQuery(appointmentId)
  const appointment = appointmentQuery.data
  const [location, setLocation] = useState<Coordinates | null>(null)
  const [sharing, setSharing] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const trackable =
    appointment?.status === 'CONFIRMED' || appointment?.status === 'IN_PROGRESS'

  useEffect(() => {
    if (!trackable) {
      setSharing(false)
      return
    }

    let watchId: number | null = null
    let active = true

    const start = async () => {
      try {
        const granted = await liveLocationService.requestPermission()
        if (!active) return
        if (!granted) {
          setLocationError('Permiso de ubicación no concedido.')
          return
        }

        setSharing(true)
        watchId = liveLocationService.watchDeviceCoordinates(
          (coords) => {
            if (!active) return
            setLocation(coords)
            setLocationError(null)
            void liveLocationService
              .publishAppointmentLiveLocation(appointmentId, coords)
              .catch(() => {
                if (active) {
                  setLocationError('No se pudo actualizar la ubicación en el servidor.')
                }
              })
          },
          (error) => {
            if (active) setLocationError(error.message)
          },
        )
      } catch (error: any) {
        if (active) {
          setLocationError(error?.message ?? 'No fue posible iniciar la ubicación.')
          setSharing(false)
        }
      }
    }

    void start()

    return () => {
      active = false
      setSharing(false)
      if (watchId !== null) liveLocationService.clearWatch(watchId)
    }
  }, [appointmentId, trackable])

  const region = useMemo<Region>(() => {
    if (!location) return CARTAGENA_FALLBACK
    return {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    }
  }, [location])

  if (appointmentQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator color={UI_COLORS.gold} />
        </View>
      </SafeAreaView>
    )
  }

  if (!appointment) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text style={styles.errorText}>No fue posible cargar la cita.</Text>
          <Button label="Volver" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Cita en domicilio</Text>
          <Text style={styles.headerSubtitle}>{appointment.time}</Text>
        </View>
        <Badge label={appointment.status} tone="gold" outline size="sm" />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card variant="flat">
          <Text style={styles.petName}>🐾 {appointment.pet?.name}</Text>
          <Text style={styles.service}>{appointment.serviceType}</Text>
          <Text style={styles.meta}>
            {appointment.client?.firstName} {appointment.client?.lastName}
          </Text>
          <Text style={styles.address}>{appointment.address}</Text>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ubicación en vivo</Text>
          <Badge
            label={sharing ? 'Compartiendo' : 'Inactiva'}
            tone={sharing ? 'success' : 'muted'}
            size="sm"
            outline
          />
        </View>

        <View style={styles.mapCard}>
          <MapView
            style={StyleSheet.absoluteFill}
            region={region}
            showsUserLocation
            showsMyLocationButton
            showsCompass
            toolbarEnabled={false}
          >
            {location && (
              <Marker
                coordinate={location}
                title="Tu ubicación"
                description="Esta posición se comparte solo con esta cita activa"
                pinColor="#D69B2D"
              />
            )}
          </MapView>
        </View>

        <Card variant="flat">
          <Text style={styles.privacyTitle}>Privacidad del tracking</Text>
          <Text style={styles.privacyText}>
            La ubicación se publica únicamente mientras esta pantalla está activa y
            la cita está CONFIRMED o IN_PROGRESS. El cliente de esta cita y un
            administrador autorizado pueden consultarla; no se muestra como
            coordenada exacta en el descubrimiento público de veterinarios.
          </Text>
        </Card>

        {locationError && (
          <Pressable
            onPress={() =>
              Alert.alert(
                'Ubicación',
                `${locationError}\n\nVerifica que GPS y permisos estén habilitados.`,
              )
            }
            style={styles.warning}
          >
            <Text style={styles.warningText}>{locationError}</Text>
          </Pressable>
        )}

        {!trackable && (
          <Text style={styles.helper}>
            El tracking se habilita automáticamente cuando la cita está confirmada.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI_COLORS.bg },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  back: { fontSize: 32, lineHeight: 32, color: UI_COLORS.gold },
  headerTitle: { fontSize: 17, fontWeight: '800', color: UI_COLORS.text },
  headerSubtitle: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  petName: { fontSize: 18, fontWeight: '800', color: UI_COLORS.text },
  service: { fontSize: 14, fontWeight: '700', color: UI_COLORS.gold, marginTop: 6 },
  meta: { fontSize: 13, color: UI_COLORS.muted, marginTop: 4 },
  address: { fontSize: 13, color: UI_COLORS.text, lineHeight: 18, marginTop: 10 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: UI_COLORS.text },
  mapCard: {
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: '#E8F0EA',
  },
  privacyTitle: { fontSize: 13, fontWeight: '800', color: UI_COLORS.text },
  privacyText: { fontSize: 12, lineHeight: 18, color: UI_COLORS.muted, marginTop: 6 },
  warning: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF4E5',
    borderWidth: 1,
    borderColor: UI_COLORS.warning,
  },
  warningText: { fontSize: 12, color: UI_COLORS.error },
  helper: { fontSize: 12, color: UI_COLORS.muted, textAlign: 'center' },
  errorText: { fontSize: 14, color: UI_COLORS.error, textAlign: 'center' },
})
