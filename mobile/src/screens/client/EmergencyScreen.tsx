/**
 * EmergencyScreen — atención prioritaria sin promesas operativas ficticias.
 *
 * Esta pantalla orienta al usuario ante signos de alarma y lo dirige a dos
 * destinos reales del producto: búsqueda de veterinarios y Mis citas. No
 * expone teléfonos hard-coded, tiempos de respuesta ni canales 24/7 que no
 * estén respaldados por una integración operativa verificable.
 */

import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon, type IconName } from '../../components/common/Icon'

interface Props {
  navigation: any
}

const EMERGENCY = {
  red: '#EF4444',
  redDark: '#B91C1C',
  redSoft: '#FEE2E2',
  redSofter: '#FFF5F5',
} as const

interface Symptom {
  icon: IconName
  label: string
}

const SYMPTOMS: Symptom[] = [
  { icon: 'heart', label: 'Dificultad para respirar' },
  { icon: 'lock', label: 'Convulsiones o pérdida de conciencia' },
  { icon: 'check', label: 'Hemorragia que no se detiene' },
  { icon: 'history', label: 'Vómitos o diarrea severa y repetida' },
  { icon: 'shield', label: 'Accidente, caída o golpe fuerte' },
  { icon: 'star', label: 'Dolor intenso o deterioro súbito' },
]

const TIPS = [
  'Mantén a tu mascota en un lugar seguro y reduce el movimiento si hubo trauma.',
  'No suministres medicamentos humanos ni veterinarios sin indicación profesional.',
  'Si es seguro hacerlo, registra fotos o video de los síntomas para mostrarlos al veterinario.',
  'Ten disponibles antecedentes, medicamentos actuales y cartilla de vacunación.',
  'Si el estado empeora rápidamente, busca un servicio veterinario presencial de urgencias cercano.',
]

function currentTabName(navigation: any): string | undefined {
  const tabs = navigation.getParent?.()
  const state = tabs?.getState?.()
  if (!state || typeof state.index !== 'number') return undefined
  return state.routes?.[state.index]?.name
}

export default function EmergencyScreen({ navigation }: Props) {
  const openVetSearch = useCallback(() => {
    const tabs = navigation.getParent?.()
    if (!tabs) {
      Alert.alert(
        'No se pudo abrir la búsqueda',
        'Regresa al inicio y abre la sección Servicios para buscar un veterinario disponible.',
      )
      return
    }

    tabs.navigate('ClientSearch', {
      screen: 'SearchMain',
      params: {
        specialty: 'Emergencias',
        availableNow: true,
      },
    })
  }, [navigation])

  const openAppointments = useCallback(() => {
    const tabs = navigation.getParent?.()
    if (currentTabName(navigation) === 'ClientAppointments') {
      navigation.popToTop()
      return
    }
    if (!tabs) {
      Alert.alert(
        'No se pudo abrir Mis citas',
        'Regresa al inicio y abre la sección Citas para contactar a tu veterinario.',
      )
      return
    }

    tabs.navigate('ClientAppointments')
  }, [navigation])

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
        <Text style={styles.headerTitle}>Emergencias</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.eyebrowBadge}>
          <Icon name="emergency" size={14} color={EMERGENCY.redDark} />
          <Text style={styles.eyebrowText}>ATENCIÓN PRIORITARIA</Text>
        </View>

        <Text style={styles.heroTitle}>¿Tu mascota necesita atención urgente?</Text>
        <Text style={styles.heroSubtitle}>
          Revisa los signos de alarma y utiliza los canales disponibles en la app
          para localizar un veterinario o contactar al profesional de una cita ya
          creada.
        </Text>

        <View style={styles.ctaGroup}>
          <Pressable
            onPress={openVetSearch}
            style={({ pressed }) => [
              styles.ctaPrimary,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Buscar veterinario para una emergencia"
          >
            <Icon name="location" size={20} color="#FFFFFF" />
            <View style={styles.ctaCopy}>
              <Text style={styles.ctaPrimaryTitle}>Buscar veterinario</Text>
              <Text style={styles.ctaPrimaryBody}>
                Abre Servicios para consultar profesionales disponibles.
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={openAppointments}
            style={({ pressed }) => [
              styles.ctaSecondary,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Abrir Mis citas para contactar al veterinario"
          >
            <Icon name="history" size={19} color={EMERGENCY.redDark} />
            <View style={styles.ctaCopy}>
              <Text style={styles.ctaSecondaryTitle}>Ya tengo una cita</Text>
              <Text style={styles.ctaSecondaryBody}>
                Abre Mis citas y usa el chat o la llamada del servicio activo.
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.notice}>
          <Icon name="shield" size={18} color={EMERGENCY.redDark} />
          <Text style={styles.noticeText}>
            Nvet no muestra una línea telefónica de emergencia hasta disponer de un
            número operativo verificado. Si existe riesgo vital inmediato y no
            encuentras disponibilidad en la app, busca una clínica veterinaria de
            urgencias cercana por un canal externo confiable.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signos de alarma</Text>
          <Text style={styles.sectionSubtitle}>
            Estos ejemplos justifican una valoración veterinaria prioritaria.
          </Text>
          <View style={styles.symptomsGrid}>
            {SYMPTOMS.map((symptom) => (
              <View key={symptom.label} style={styles.symptomCard}>
                <View style={styles.symptomIcon}>
                  <Icon name={symptom.icon} size={20} color={EMERGENCY.redDark} />
                </View>
                <Text style={styles.symptomLabel}>{symptom.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mientras recibes orientación</Text>
          <View style={styles.tipsList}>
            {TIPS.map((tip) => (
              <View key={tip} style={styles.tipRow}>
                <View style={styles.tipBullet}>
                  <Icon name="check" size={11} color={EMERGENCY.redDark} />
                </View>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.trustCard}>
          <Icon name="verified" size={20} color={Colors.sage} />
          <View style={styles.trustCopy}>
            <Text style={styles.trustTitle}>Información responsable</Text>
            <Text style={styles.trustBody}>
              Esta pantalla no reemplaza una valoración clínica y evita mostrar
              contactos, tiempos de llegada o disponibilidad que el sistema no pueda
              verificar en tiempo real.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  headerSpacer: { width: 24 },
  scrollContent: { padding: 20, paddingBottom: 40, rowGap: 18 },
  eyebrowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    alignSelf: 'flex-start',
    backgroundColor: EMERGENCY.redSoft,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  eyebrowText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: EMERGENCY.redDark,
  },
  heroTitle: {
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '800',
    color: Colors.ink,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.inkSec,
  },
  ctaGroup: { rowGap: 10 },
  ctaPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
    borderRadius: 16,
    padding: 16,
    backgroundColor: EMERGENCY.red,
  },
  ctaSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
    borderRadius: 16,
    padding: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  ctaCopy: { flex: 1 },
  ctaPrimaryTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  ctaPrimaryBody: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.88)',
  },
  ctaSecondaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: EMERGENCY.redDark,
  },
  ctaSecondaryBody: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: Colors.inkSec,
  },
  pressed: { opacity: 0.82 },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: 10,
    borderRadius: 14,
    padding: 14,
    backgroundColor: EMERGENCY.redSofter,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.inkSec,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: Colors.ink },
  sectionSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.inkSec,
  },
  symptomsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  symptomCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 14,
    padding: 12,
    backgroundColor: EMERGENCY.redSofter,
  },
  symptomIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMERGENCY.redSoft,
  },
  symptomLabel: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  tipsList: { marginTop: 14, rowGap: 11 },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: 9,
  },
  tipBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: EMERGENCY.redSoft,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.inkSec,
  },
  trustCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: 10,
    borderRadius: 14,
    padding: 14,
    backgroundColor: Colors.greenSoft,
  },
  trustCopy: { flex: 1 },
  trustTitle: { fontSize: 13, fontWeight: '800', color: Colors.ink },
  trustBody: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: Colors.inkSec,
  },
})
