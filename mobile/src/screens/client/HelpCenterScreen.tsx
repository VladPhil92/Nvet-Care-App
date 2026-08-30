import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon, type IconName } from '../../components/common/Icon'

type HelpItem = {
  icon: IconName
  title: string
  body: string
}

const HELP_ITEMS: HelpItem[] = [
  {
    icon: 'location',
    title: 'La ubicación no se actualiza',
    body: 'Comprueba tu conexión y los permisos de ubicación. El seguimiento del veterinario se refresca automáticamente y puede tardar unos segundos en reflejar una nueva posición.',
  },
  {
    icon: 'history',
    title: 'El veterinario presenta retraso',
    body: 'Regresa al seguimiento y utiliza los botones de chat o llamada de la cita para comunicarte directamente con el profesional asignado.',
  },
  {
    icon: 'chat',
    title: 'Necesito revisar mi cita',
    body: 'Abre Mis citas para consultar el estado, los datos del servicio y los canales de contacto disponibles para cada reserva.',
  },
]

interface Props {
  navigation: any
}

export default function HelpCenterScreen({ navigation }: Props) {
  const openAppointments = useCallback(() => {
    const tabs = navigation.getParent?.()
    if (tabs) {
      tabs.navigate('ClientAppointments')
      return
    }
    navigation.goBack()
  }, [navigation])

  const openEmergency = useCallback(() => {
    navigation.navigate('Emergency')
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
        <Text style={styles.headerTitle}>Ayuda con tu cita</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="chat" size={26} color={Colors.sage} />
          </View>
          <Text style={styles.heroTitle}>¿Qué necesitas resolver?</Text>
          <Text style={styles.heroBody}>
            Este centro reúne las acciones disponibles hoy para una cita activa. No
            crea tickets ficticios ni promete un canal de soporte que todavía no
            existe en el backend.
          </Text>
        </View>

        <View style={styles.list}>
          {HELP_ITEMS.map((item) => (
            <View key={item.title} style={styles.helpCard}>
              <View style={styles.cardIcon}>
                <Icon name={item.icon} size={20} color={Colors.sage} />
              </View>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={openAppointments}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Abrir Mis citas"
        >
          <Icon name="history" size={20} color="#FFFFFF" />
          <View style={styles.actionCopy}>
            <Text style={styles.primaryActionTitle}>Abrir Mis citas</Text>
            <Text style={styles.primaryActionBody}>
              Revisa detalles y contacta al veterinario de tu reserva.
            </Text>
          </View>
        </Pressable>

        <View style={styles.emergencyCard}>
          <View style={styles.emergencyCopy}>
            <Text style={styles.emergencyEyebrow}>¿ES UNA URGENCIA MÉDICA?</Text>
            <Text style={styles.emergencyTitle}>Emergencias veterinarias 24/7</Text>
            <Text style={styles.emergencyBody}>
              Si tu mascota presenta dificultad para respirar, convulsiones,
              hemorragia u otro signo grave, utiliza el módulo de emergencias.
            </Text>
          </View>
          <Pressable
            onPress={openEmergency}
            style={({ pressed }) => [styles.emergencyAction, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Abrir Emergencias veterinarias"
          >
            <Icon name="emergency" size={18} color="#FFFFFF" />
            <Text style={styles.emergencyActionText}>Abrir Emergencias</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  headerSpacer: { width: 24 },
  content: { padding: 20, paddingBottom: 40, rowGap: 18 },
  hero: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.greenSoft,
    marginBottom: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: Colors.ink },
  heroBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.inkSec,
  },
  list: { rowGap: 10 },
  helpCard: {
    flexDirection: 'row',
    columnGap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.greenSoft,
  },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  cardBody: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.inkSec,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 12,
    backgroundColor: Colors.sage,
    borderRadius: 16,
    padding: 16,
  },
  actionCopy: { flex: 1 },
  primaryActionTitle: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  primaryActionBody: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.85)',
  },
  emergencyCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  emergencyCopy: { marginBottom: 14 },
  emergencyEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#B91C1C',
  },
  emergencyTitle: {
    marginTop: 5,
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink,
  },
  emergencyBody: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.inkSec,
  },
  emergencyAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    backgroundColor: '#DC2626',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emergencyActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.82 },
})
