import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { Badge, UI_COLORS } from '../ui/primitives'
import { formatCOP, formatDistance, formatRatingStars } from '../../utils/format'

/**
 * VetCard — tarjeta visual reutilizable con datos del veterinario.
 *
 * Usada en:
 *  - SearchVetsScreen (lista de resultados)
 *  - HomeScreen (próxima cita)
 *  - VetDetailsScreen (header)
 *
 * Decisiones:
 *  - Layout adaptable: muestra solo lo que recibe (rating opcional, distance opcional, etc.)
 *  - Avatar generado de iniciales si no hay imagen (evita layout shift)
 *  - Touch target ≥48dp; aria-label descriptivo
 */

export interface VetCardData {
  id: string
  firstName?: string | null
  lastName?: string | null
  avatar?: string | null
  tier?: 'FREE' | 'PRO' | 'ELITE'
  rating?: number | null
  reviewCount?: number
  yearsExperience?: number | null
  specialties?: string[]
  /** Precio mínimo entre los servicios del vet (para preview de "desde…") */
  startingPriceCop?: number | null
  /** Distancia desde la ubicación del usuario (km), si aplica */
  distanceKm?: number | null
  /** Si está disponible para servicios inmediatos */
  isAvailableNow?: boolean
  city?: string | null
}

interface Props {
  vet: VetCardData
  onPress?: () => void
  /** Layout: 'list' = horizontal compact; 'detailed' = más info, vertical */
  layout?: 'list' | 'detailed'
}

function getInitials(first?: string | null, last?: string | null): string {
  const f = first?.trim()?.[0]?.toUpperCase() ?? ''
  const l = last?.trim()?.[0]?.toUpperCase() ?? ''
  return (f + l) || '👨‍⚕️'
}

const TIER_TONES = {
  FREE: 'muted' as const,
  PRO: 'sage' as const,
  ELITE: 'gold' as const,
}

export default function VetCard({ vet, onPress, layout = 'list' }: Props) {
  const fullName =
    `${vet.firstName ?? ''} ${vet.lastName ?? ''}`.trim() || 'Veterinario'

  const a11yLabel = [
    fullName,
    vet.tier && `tier ${vet.tier}`,
    vet.rating != null && `${vet.rating.toFixed(1)} estrellas`,
    vet.reviewCount != null && `${vet.reviewCount} reseñas`,
    vet.distanceKm != null && `a ${formatDistance(vet.distanceKm)}`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.85, transform: [{ scale: 0.998 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Toca para ver el perfil del veterinario"
    >
      <View style={styles.row}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getInitials(vet.firstName, vet.lastName)}
          </Text>
          {vet.isAvailableNow && (
            <View style={styles.availabilityDot} accessibilityLabel="Disponible ahora" />
          )}
        </View>

        {/* Info */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>
              Dr. {fullName}
            </Text>
            {vet.tier && (
              <Badge label={vet.tier} tone={TIER_TONES[vet.tier]} size="sm" />
            )}
          </View>

          {vet.specialties && vet.specialties.length > 0 && (
            <Text style={styles.specialties} numberOfLines={1}>
              {vet.specialties.slice(0, 3).join(' · ')}
            </Text>
          )}

          <View style={styles.metaRow}>
            {vet.rating != null && vet.rating > 0 && (
              <View style={styles.metaItem}>
                <Text style={styles.stars}>
                  {formatRatingStars(vet.rating, 5)}
                </Text>
                <Text style={styles.metaText}>
                  {vet.rating.toFixed(1)}
                  {vet.reviewCount != null && ` (${vet.reviewCount})`}
                </Text>
              </View>
            )}
            {vet.distanceKm != null && (
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>📍 {formatDistance(vet.distanceKm)}</Text>
              </View>
            )}
            {vet.yearsExperience != null && layout === 'detailed' && (
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>
                  🎓 {vet.yearsExperience} {vet.yearsExperience === 1 ? 'año' : 'años'}
                </Text>
              </View>
            )}
          </View>

          {vet.startingPriceCop != null && (
            <Text style={styles.price}>
              Desde <Text style={styles.priceAmount}>{formatCOP(vet.startingPriceCop)}</Text>
            </Text>
          )}

          {layout === 'detailed' && vet.city && (
            <Text style={styles.city}>{vet.city}</Text>
          )}
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: UI_COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#5B75531a',
    borderWidth: 1,
    borderColor: UI_COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: UI_COLORS.sage },
  availabilityDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: UI_COLORS.success,
    borderWidth: 2,
    borderColor: UI_COLORS.card,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.text,
    flex: 1,
  },
  specialties: {
    fontSize: 13,
    color: UI_COLORS.muted,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stars: {
    fontSize: 12,
    color: UI_COLORS.gold,
    letterSpacing: 1,
  },
  metaText: { fontSize: 12, color: UI_COLORS.muted, fontWeight: '500' },
  price: { fontSize: 13, color: UI_COLORS.muted, marginTop: 2 },
  priceAmount: { color: UI_COLORS.sage, fontWeight: '700' },
  city: {
    fontSize: 12,
    color: UI_COLORS.muted,
    marginTop: 4,
  },
})
