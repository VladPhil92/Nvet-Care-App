/**
 * PaymentMethodsCard — alineado con el mockup "Pagos seguros".
 *
 * Renderiza:
 *   - Lista de métodos de pago aceptados (Visa, MasterCard, Amex, Diners,
 *     PayPal, PSE, Nequi, Apple Pay) como pill badges
 *   - Card "Protección al usuario" con 3 garantías (Cancelación gratuita,
 *     Reembolso 100%, Atención garantizada o devolución)
 *   - Badges de seguridad: PCI DSS · SSL Encryption · Ley 1581/2012
 *
 * Como wordmark de cada método sin assets binarios: usamos texto estilizado
 * en pill blanco con su typography característica. Cuando se integren los
 * SVG/PNG oficiales, basta con reemplazar el `<Text>` por `<Image>` o `<Svg>`.
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

import { Colors } from '../../theme/colors'
import { Icon } from '../common/Icon'

interface PaymentMethod {
  label: string
  /** Color de marca del método (texto del wordmark) */
  brandColor: string
  /** Letras pequeñas debajo (opcional, para "by Stripe", etc.) */
  italic?: string
}

const METHODS: PaymentMethod[] = [
  { label: 'VISA', brandColor: '#1A1F71', italic: 'CARD' },
  { label: 'MasterCard', brandColor: '#EB001B' },
  { label: 'AMERICAN EXPRESS', brandColor: '#006FCF' },
  { label: 'Diners Club', brandColor: '#0079BE' },
  { label: 'PayPal', brandColor: '#003087' },
  { label: 'PSE', brandColor: '#1A56DB' },
  { label: 'Nequi', brandColor: '#240E5C' },
  { label: 'Apple Pay', brandColor: '#000000' },
]

const PROTECTIONS = [
  {
    icon: 'check' as const,
    text: 'Cancelación gratuita hasta 1 hora antes del servicio',
  },
  {
    icon: 'check' as const,
    text: 'Reembolso del 100% si el servicio no se realiza',
  },
  {
    icon: 'check' as const,
    text: 'Atención garantizada o te devolvemos tu dinero',
  },
]

const COMPLIANCE = [
  { label: 'PCI DSS', icon: 'lock' as const },
  { label: 'SSL Encryption', icon: 'shield' as const },
  { label: 'Ley 1581/2012', icon: 'verified' as const },
]

interface Props {
  /** Si false, oculta la card de protección al usuario (solo muestra logos) */
  showProtection?: boolean
}

export function PaymentMethodsCard({ showProtection = true }: Props) {
  return (
    <View style={styles.container}>
      {/* ── Métodos aceptados ─────────────────────────────── */}
      <Text style={styles.sectionTitle}>Métodos de pago aceptados</Text>
      <View style={styles.methodsGrid}>
        {METHODS.map((m) => (
          <View key={m.label} style={styles.methodPill}>
            <Text style={[styles.methodLabel, { color: m.brandColor }]} numberOfLines={1}>
              {m.label}
            </Text>
            {m.italic && (
              <Text style={[styles.methodItalic, { color: m.brandColor }]}>
                {m.italic}
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* ── Compliance badges ─────────────────────────────── */}
      <View style={styles.complianceRow}>
        {COMPLIANCE.map((c) => (
          <View key={c.label} style={styles.complianceBadge}>
            <Icon name={c.icon} size={12} color={Colors.sage} />
            <Text style={styles.complianceText}>{c.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.processingNote}>
        <Icon name="lock" size={14} color={Colors.sageText} />
        <Text style={styles.processingText}>
          Procesamos pagos a través de pasarelas certificadas y encriptadas.
        </Text>
      </View>

      {/* ── Protección al usuario ─────────────────────────── */}
      {showProtection && (
        <View style={styles.protectionCard}>
          <View style={styles.protectionHeader}>
            <Icon name="shield" size={18} color={Colors.sage} />
            <Text style={styles.protectionTitle}>Protección al usuario</Text>
          </View>
          {PROTECTIONS.map((p) => (
            <View key={p.text} style={styles.protectionRow}>
              <View style={styles.protectionCheck}>
                <Icon name="check" size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.protectionText}>{p.text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    rowGap: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.ink,
  },

  // Methods grid
  methodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
  },
  methodPill: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    minHeight: 38,
  },
  methodLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  methodItalic: {
    fontSize: 8,
    fontWeight: '600',
    fontStyle: 'italic',
    letterSpacing: 0.3,
    marginLeft: 2,
  },

  // Compliance
  complianceRow: {
    flexDirection: 'row',
    columnGap: 10,
    flexWrap: 'wrap',
    rowGap: 8,
  },
  complianceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    backgroundColor: Colors.greenSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  complianceText: {
    fontSize: 11,
    color: Colors.sageText,
    fontWeight: '700',
  },

  processingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.greenSoft,
    borderRadius: 10,
  },
  processingText: {
    flex: 1,
    fontSize: 11,
    color: Colors.ink,
    fontWeight: '500',
    lineHeight: 14,
  },

  // Protection card
  protectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    rowGap: 10,
  },
  protectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginBottom: 4,
  },
  protectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.ink,
  },
  protectionRow: {
    flexDirection: 'row',
    columnGap: 10,
    alignItems: 'flex-start',
  },
  protectionCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  protectionText: {
    flex: 1,
    fontSize: 12,
    color: Colors.ink,
    lineHeight: 16,
    fontWeight: '500',
  },
})
