import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import Geolocation from '@react-native-community/geolocation'
import { useQueryClient } from '@tanstack/react-query'

import coverageService from '../../services/coverage.service'
import { apiClient, getErrorMessage } from '../../services/api'
import type { Vet } from '../../services/vet.service'
import { qk } from '../../lib/queryKeys'

const COLORS = {
  gold: '#C9A961',
  sage: '#5B7553',
  sageSoft: '#EEF3EC',
  bg: '#FAFAF7',
  card: '#FFFFFF',
  text: '#1F2A1B',
  muted: '#5F6B5A',
  border: '#E5E2D8',
  error: '#C53030',
} as const

const SERVICE_MARKETS = [
  { daneCode: '13001', city: 'Cartagena de Indias', department: 'Bolívar' },
  { daneCode: '11001', city: 'Bogotá D.C.', department: 'Bogotá D.C.' },
  { daneCode: '05001', city: 'Medellín', department: 'Antioquia' },
  { daneCode: '08001', city: 'Barranquilla', department: 'Atlántico' },
  { daneCode: '68001', city: 'Bucaramanga', department: 'Santander' },
  { daneCode: '68276', city: 'Floridablanca', department: 'Santander' },
  { daneCode: '76001', city: 'Cali', department: 'Valle del Cauca' },
  { daneCode: '70001', city: 'Sincelejo', department: 'Sucre' },
  { daneCode: '23001', city: 'Montería', department: 'Córdoba' },
  { daneCode: '47001', city: 'Santa Marta', department: 'Magdalena' },
] as const

type VetWithServiceArea = Vet & { serviceRadius?: number | null }

interface Props {
  profile: VetWithServiceArea
}

async function requestAndroidLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'Ubicación de servicio',
      message:
        'Nvet usa tu ubicación únicamente para validar tu base de atención y calcular el radio de servicio a domicilio.',
      buttonPositive: 'Permitir',
      buttonNegative: 'Ahora no',
    },
  )
  return granted === PermissionsAndroid.RESULTS.GRANTED
}

export default function VetServiceAreaScreen({ profile }: Props) {
  const queryClient = useQueryClient()
  const initialMarket = SERVICE_MARKETS.find((market) => market.city === profile.city)
  const [marketCode, setMarketCode] = useState(initialMarket?.daneCode ?? '13001')
  const [latitude, setLatitude] = useState(profile.latitude != null ? String(profile.latitude) : '')
  const [longitude, setLongitude] = useState(profile.longitude != null ? String(profile.longitude) : '')
  const [radius, setRadius] = useState(String(profile.serviceRadius || 10))
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const market = useMemo(
    () => SERVICE_MARKETS.find((candidate) => candidate.daneCode === marketCode) ?? SERVICE_MARKETS[0],
    [marketCode],
  )

  const useCurrentLocation = async () => {
    setError(null)
    setNotice(null)
    setLocating(true)
    try {
      const permitted = await requestAndroidLocationPermission()
      if (!permitted) {
        setError('No se otorgó permiso de ubicación. Puedes registrar las coordenadas manualmente.')
        setLocating(false)
        return
      }

      Geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude.toFixed(6))
          setLongitude(position.coords.longitude.toFixed(6))
          setNotice('Ubicación obtenida. Confirma la ciudad y valida tu zona de servicio.')
          setLocating(false)
        },
        () => {
          setError('No fue posible obtener tu ubicación. Activa la ubicación del dispositivo o ingresa las coordenadas manualmente.')
          setLocating(false)
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
      )
    } catch (err) {
      setError(getErrorMessage(err))
      setLocating(false)
    }
  }

  const submit = async () => {
    setError(null)
    setNotice(null)

    const lat = Number(latitude)
    const lng = Number(longitude)
    const serviceRadius = Number(radius)

    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      setError('Registra coordenadas válidas para tu base de atención.')
      return
    }
    if (!Number.isFinite(serviceRadius) || serviceRadius < 1 || serviceRadius > 100) {
      setError('El radio de servicio debe estar entre 1 y 100 km.')
      return
    }

    setSubmitting(true)
    try {
      const point = await coverageService.checkPoint(lat, lng)
      if (!point.supported || !point.market) {
        setError('La ubicación indicada todavía no pertenece a una ciudad preparada por Nvet.')
        return
      }
      if (point.market.daneCode !== market.daneCode) {
        setError(
          `La ubicación corresponde a ${point.market.city}, pero seleccionaste ${market.city}. Corrige la ciudad o la ubicación antes de continuar.`,
        )
        return
      }

      await apiClient.patch('/vets/me', {
        city: market.city,
        department: market.department,
        latitude: lat,
        longitude: lng,
        serviceRadius,
        timezone: 'America/Bogota',
      })
      await queryClient.invalidateQueries({ queryKey: qk.vets.me.profile() })
      setNotice(
        point.active
          ? `Zona de servicio validada para ${market.city}.`
          : `Zona validada para ${market.city}. Este mercado permanecerá en pre-lanzamiento hasta su activación operativa.`,
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ZONA DE SERVICIO · PASO OBLIGATORIO</Text>
          </View>
          <Text style={styles.title}>Define dónde atenderás a domicilio</Text>
          <Text style={styles.subtitle}>
            La ciudad, tu base geográfica y el radio de atención determinan si tu perfil puede contar para la cobertura de mercado y si un domicilio puede reservar contigo. Tu coordenada exacta no se publica en el catálogo de cobertura.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Ciudad de operación</Text>
            <View style={styles.marketGrid}>
              {SERVICE_MARKETS.map((candidate) => {
                const selected = candidate.daneCode === marketCode
                return (
                  <Pressable
                    key={candidate.daneCode}
                    onPress={() => setMarketCode(candidate.daneCode)}
                    disabled={submitting || locating}
                    style={[styles.marketButton, selected && styles.marketButtonSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${candidate.city}, ${candidate.department}`}
                  >
                    <Text style={[styles.marketText, selected && styles.marketTextSelected]}>{candidate.city}</Text>
                    <Text style={styles.marketDepartment}>{candidate.department}</Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={styles.label}>Latitud base</Text>
            <TextInput
              value={latitude}
              onChangeText={setLatitude}
              placeholder="10.39"
              placeholderTextColor={COLORS.muted}
              keyboardType="numbers-and-punctuation"
              editable={!submitting && !locating}
              style={styles.input}
              accessibilityLabel="Latitud base de servicio"
            />

            <Text style={styles.label}>Longitud base</Text>
            <TextInput
              value={longitude}
              onChangeText={setLongitude}
              placeholder="-75.48"
              placeholderTextColor={COLORS.muted}
              keyboardType="numbers-and-punctuation"
              editable={!submitting && !locating}
              style={styles.input}
              accessibilityLabel="Longitud base de servicio"
            />

            <Pressable
              onPress={() => void useCurrentLocation()}
              disabled={submitting || locating}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, (submitting || locating) && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Usar mi ubicación actual como base de servicio"
            >
              {locating ? <ActivityIndicator color={COLORS.sage} /> : <Text style={styles.secondaryButtonText}>Usar mi ubicación actual</Text>}
            </Pressable>

            <Text style={styles.label}>Radio máximo de atención (km)</Text>
            <TextInput
              value={radius}
              onChangeText={setRadius}
              placeholder="10"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
              editable={!submitting && !locating}
              style={styles.input}
              accessibilityLabel="Radio máximo de atención en kilómetros"
            />

            <View style={styles.marketSummary}>
              <Text style={styles.summaryText}>
                Mercado seleccionado: <Text style={styles.summaryStrong}>{market.city}</Text> · DANE {market.daneCode}. Registrarte en una ciudad en pre-lanzamiento no habilita reservas hasta que Nvet abra formalmente ese mercado.
              </Text>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}
            {notice && <Text style={styles.notice}>{notice}</Text>}

            <Pressable
              onPress={() => void submit()}
              disabled={submitting || locating}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, (submitting || locating) && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Validar y guardar zona de servicio"
              accessibilityState={{ busy: submitting }}
            >
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Validar y guardar zona de servicio</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: 22, paddingBottom: 48 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  badgeText: { color: COLORS.gold, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  title: { fontSize: 27, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 20, marginBottom: 20 },
  card: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 18 },
  label: { fontSize: 11, fontWeight: '800', color: COLORS.text, marginBottom: 7, marginTop: 13, letterSpacing: 0.5 },
  marketGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  marketButton: { minWidth: '47%', flexGrow: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg, borderRadius: 10, padding: 10 },
  marketButtonSelected: { borderColor: COLORS.sage, backgroundColor: COLORS.sageSoft },
  marketText: { color: COLORS.text, fontWeight: '700', fontSize: 12 },
  marketTextSelected: { color: COLORS.sage },
  marketDepartment: { color: COLORS.muted, fontSize: 10.5, marginTop: 2 },
  input: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 13, backgroundColor: COLORS.bg, color: COLORS.text, fontSize: 14 },
  secondaryButton: { minHeight: 46, borderWidth: 1, borderColor: COLORS.sage, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryButtonText: { color: COLORS.sage, fontSize: 13, fontWeight: '800' },
  marketSummary: { backgroundColor: COLORS.bg, borderRadius: 10, padding: 12, marginTop: 16 },
  summaryText: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  summaryStrong: { color: COLORS.text, fontWeight: '800' },
  error: { color: COLORS.error, fontSize: 12, lineHeight: 18, marginTop: 14 },
  notice: { color: COLORS.sage, backgroundColor: COLORS.sageSoft, borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 18, marginTop: 14 },
  primaryButton: { minHeight: 50, borderRadius: 10, backgroundColor: COLORS.sage, alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 14 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
})
