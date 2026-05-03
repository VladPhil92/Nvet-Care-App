/**
 * PaymentFlowStepper — los 5 pasos visuales del flujo de pago oficial.
 *
 * Alineado con el mockup "Pagos seguros, tranquilidad total":
 *   1. Solicitas el servicio    (secure-payment)
 *   2. Pagas de forma segura    (shield)
 *   3. Servicio en progreso     (location)
 *   4. Servicio completado      (verified ← check)
 *   5. Pago liberado            (medal)
 *
 * El paso "actual" se resalta en verde, los pasados quedan completados (verde
 * con check), los futuros aparecen en gris. Conectores horizontales entre pasos.
 *
 * Reutilizable en:
 *   - BookAppointmentScreen (header del stepper de booking)
 *   - WalletScreen (sección "Así funciona tu pago")
 *   - TopUpWalletScreen (similar)
 */

import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'

import { Colors } from '../../theme/colors'
import { Icon, type IconName } from '../common/Icon'

export type PaymentStep =
  | 'requested'
  | 'paid'
  | 'in_progress'
  | 'completed'
  | 'released'

interface StepDef {
  key: PaymentStep
  icon: IconName
  label: string
  description: string
}

const STEPS: StepDef[] = [
  {
    key: 'requested',
    icon: 'secure-payment',
    label: 'Solicitas el servicio',
    description: 'Eliges el servicio y confirmas tu solicitud.',
  },
  {
    key: 'paid',
    icon: 'shield',
    label: 'Pagas de forma segura',
    description: 'El pago se procesa y se retiene de forma segura en nuestra plataforma.',
  },
  {
    key: 'in_progress',
    icon: 'location',
    label: 'Servicio en progreso',
    description: 'El veterinario realiza el servicio en la fecha y hora acordada.',
  },
  {
    key: 'completed',
    icon: 'verified',
    label: 'Servicio completado',
    description: 'Confirmas que todo está bien con el servicio recibido.',
  },
  {
    key: 'released',
    icon: 'medal',
    label: 'Pago liberado',
    description: 'Liberamos el pago al veterinario de manera segura.',
  },
]

interface Props {
  currentStep: PaymentStep
  /** Si true, muestra solo iconos en row scrollable (variante compacta) */
  compact?: boolean
}

export function PaymentFlowStepper({ currentStep, compact = false }: Props) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep)

  if (compact) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.compactRow}
      >
        {STEPS.map((step, idx) => {
          const reached = idx <= currentIndex
          const isLast = idx === STEPS.length - 1
          return (
            <React.Fragment key={step.key}>
              <View style={styles.compactItem}>
                <View
                  style={[
                    styles.compactCircle,
                    reached ? styles.circleReached : styles.circleIdle,
                    idx === currentIndex && styles.circleCurrent,
                  ]}
                >
                  <Icon
                    name={step.icon}
                    size={16}
                    color={reached ? '#FFFFFF' : Colors.inkMuted}
                  />
                </View>
                <Text style={styles.compactLabel} numberOfLines={2}>
                  {step.label}
                </Text>
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.compactConnector,
                    {
                      backgroundColor:
                        idx < currentIndex ? Colors.sage : Colors.line,
                    },
                  ]}
                />
              )}
            </React.Fragment>
          )
        })}
      </ScrollView>
    )
  }

  // Variante completa (con descripción debajo de cada paso)
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {STEPS.map((step, idx) => {
          const reached = idx <= currentIndex
          const isLast = idx === STEPS.length - 1
          return (
            <React.Fragment key={step.key}>
              <View style={styles.col}>
                <View
                  style={[
                    styles.circle,
                    reached ? styles.circleReached : styles.circleIdle,
                    idx === currentIndex && styles.circleCurrent,
                  ]}
                >
                  <Icon
                    name={step.icon}
                    size={20}
                    color={reached ? '#FFFFFF' : Colors.inkMuted}
                  />
                  {idx < currentIndex && (
                    <View style={styles.miniCheck}>
                      <Icon name="check" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Text style={styles.stepNumber}>{idx + 1}</Text>
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.connector,
                    {
                      backgroundColor:
                        idx < currentIndex ? Colors.sage : Colors.line,
                    },
                  ]}
                />
              )}
            </React.Fragment>
          )
        })}
      </View>

      {/* Labels debajo de la fila de iconos */}
      <View style={styles.labelsRow}>
        {STEPS.map((step) => (
          <View key={step.key} style={styles.labelCol}>
            <Text style={styles.label} numberOfLines={2}>
              {step.label}
            </Text>
            <Text style={styles.description} numberOfLines={3}>
              {step.description}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.line,
  },

  // Variante completa
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  col: {
    alignItems: 'center',
    width: 56,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circleIdle: { backgroundColor: Colors.line },
  circleReached: { backgroundColor: Colors.sage },
  circleCurrent: {
    transform: [{ scale: 1.05 }],
    shadowColor: Colors.sage,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  miniCheck: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.sage,
    borderWidth: 2,
    borderColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.sageText,
    marginTop: 4,
    backgroundColor: Colors.greenSoft,
    width: 18,
    height: 18,
    borderRadius: 9,
    textAlign: 'center',
    lineHeight: 18,
  },
  connector: {
    flex: 1,
    height: 2,
    marginHorizontal: -4,
    marginBottom: 18,
  },
  labelsRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    marginTop: 8,
  },
  labelCol: {
    flex: 1,
    paddingHorizontal: 4,
    rowGap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
  },
  description: {
    fontSize: 9,
    color: Colors.inkSec,
    textAlign: 'center',
    lineHeight: 12,
  },

  // Variante compacta (horizontal scroll)
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  compactItem: {
    alignItems: 'center',
    width: 64,
    rowGap: 4,
  },
  compactCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: 11,
  },
  compactConnector: {
    width: 24,
    height: 2,
    marginHorizontal: 2,
    marginBottom: 22,
  },
})
