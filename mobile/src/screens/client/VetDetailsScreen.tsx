import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import VetCard, { VetCardData } from '../../components/vet/VetCard'
import {
  Card,
  Button,
  Badge,
  EmptyState,
  Skeleton,
  SectionHeader,
  UI_COLORS,
} from '../../components/ui/primitives'
import { useVetDetailsQuery } from '../../hooks/queries/useMobileQueries'
import {
  formatCOP,
  formatRatingStars,
  formatRelativeTime,
} from '../../utils/format'

/**
 * VetDetailsScreen — perfil completo del veterinario.
 *
 * Estructura:
 *  - Header sticky con back button + share
 *  - VetCard con info principal
 *  - Tabs: Perfil / Precios / Agenda / Reviews
 *  - CTA fijo "Reservar cita" en footer (clic → BookAppointmentScreen)
 *
 * Estados:
 *  - Loading: skeleton de header + tabs
 *  - Error: EmptyState con retry
 *  - Sin datos en una tab: empty state localizado
 *
 * Decisiones:
 *  - Tabs implementadas con state local + render condicional (sin libs adicionales)
 *  - CTA "Reservar" siempre visible (sticky footer) excepto si la tab es Agenda
 *    y el vet no tiene horarios configurados
 */

const TABS = ['Perfil', 'Precios', 'Agenda', 'Reseñas'] as const
type TabKey = typeof TABS[number]

interface VetDetailsScreenProps {
  navigation: { navigate: (route: string, params?: any) => void; goBack: () => void }
  route: { params: { vetId: string } }
}

export default function VetDetailsScreen({ navigation, route }: VetDetailsScreenProps) {
  const { vetId } = route.params
  const [activeTab, setActiveTab] = useState<TabKey>('Perfil')

  const { data: vet, isPending, isError, error, refetch } = useVetDetailsQuery(vetId)

  // Adaptar datos a VetCardData
  const vetCardData = useMemo<VetCardData | null>(() => {
    if (!vet) return null
    return {
      id: vet.id,
      firstName: vet.user?.firstName,
      lastName: vet.user?.lastName,
      avatar: vet.user?.avatar,
      tier: vet.tier,
      rating: vet.rating,
      reviewCount: vet.totalReviews,
      yearsExperience: vet.yearsExperience,
      specialties: vet.specialties,
      startingPriceCop: vet.prices?.[0]?.priceCop,
      isAvailableNow: vet.isAvailableNow,
      city: vet.city,
    }
  }, [vet])

  const handleBook = () => {
    navigation.navigate('BookAppointment', { vetId })
  }

  // ============================================================
  // RENDER
  // ============================================================

  if (isPending) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.skelCard]}>
            <Skeleton width={56} height={56} borderRadius={14} />
            <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
              <Skeleton width={'70%'} height={18} />
              <Skeleton width={'50%'} height={13} />
              <Skeleton width={'60%'} height={13} />
            </View>
          </View>
          <Skeleton width={'100%'} height={40} borderRadius={10} style={{ marginVertical: 16 }} />
          <Skeleton width={'100%'} height={120} borderRadius={14} />
          <Skeleton width={'100%'} height={120} borderRadius={14} style={{ marginTop: 12 }} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (isError || !vet || !vetCardData) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="⚠"
            title="No pudimos cargar el perfil"
            subtitle={(error as Error)?.message ?? 'Verifica tu conexión'}
            actionLabel="Reintentar"
            onAction={() => refetch()}
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header onBack={() => navigation.goBack()} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <VetCard vet={vetCardData} layout="detailed" />

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => setActiveTab(t)}
              style={[styles.tab, activeTab === t && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === t }}
              accessibilityLabel={`Pestaña ${t}`}
            >
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                {t}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>
          {activeTab === 'Perfil' && <ProfileTab vet={vet} />}
          {activeTab === 'Precios' && <PricesTab prices={vet.prices ?? []} />}
          {activeTab === 'Agenda' && <ScheduleTab schedules={vet.schedules ?? []} />}
          {activeTab === 'Reseñas' && (
            <ReviewsTab reviews={vet.reviews ?? []} totalReviews={vet.totalReviews ?? 0} />
          )}
        </View>
      </ScrollView>

      {/* CTA fijo */}
      <View style={styles.cta}>
        <Button
          label="Reservar cita"
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleBook}
          accessibilityHint="Iniciar el flujo de reserva de cita con este veterinario"
        />
      </View>
    </SafeAreaView>
  )
}

// ============================================================
// SUBCOMPONENTS
// ============================================================

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Volver"
      >
        <Text style={styles.backText}>←</Text>
      </Pressable>
      <Text style={styles.headerTitle}>Perfil del veterinario</Text>
      <View style={{ width: 40 }} />
    </View>
  )
}

// --------- Perfil tab ---------
function ProfileTab({ vet }: { vet: any }) {
  return (
    <View>
      <SectionHeader title="Sobre el profesional" />
      <Card>
        <Text style={styles.bio}>
          {vet.bio || 'Este veterinario aún no ha agregado una descripción.'}
        </Text>
      </Card>

      {(vet.specialties?.length ?? 0) > 0 && (
        <>
          <SectionHeader title="Especialidades" />
          <Card>
            <View style={styles.tagRow}>
              {vet.specialties.map((s: string) => (
                <Badge key={s} label={s} tone="sage" outline />
              ))}
            </View>
          </Card>
        </>
      )}

      {(vet.universityName || vet.yearsExperience) && (
        <>
          <SectionHeader title="Formación y experiencia" />
          <Card>
            {vet.universityName && (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Universidad</Text>
                <Text style={styles.factValue}>{vet.universityName}</Text>
              </View>
            )}
            {vet.graduationYear && (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Graduación</Text>
                <Text style={styles.factValue}>{vet.graduationYear}</Text>
              </View>
            )}
            {vet.yearsExperience != null && (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Experiencia</Text>
                <Text style={styles.factValue}>
                  {vet.yearsExperience} {vet.yearsExperience === 1 ? 'año' : 'años'}
                </Text>
              </View>
            )}
            {vet.licenseNumber && (
              <View style={[styles.factRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.factLabel}>Tarjeta profesional</Text>
                <Text style={[styles.factValue, { fontFamily: 'monospace' }]}>
                  {vet.licenseNumber}
                </Text>
              </View>
            )}
          </Card>
        </>
      )}

      {(vet.completedAppointments ?? 0) > 0 && (
        <>
          <SectionHeader title="Trayectoria en Nvet Care" />
          <Card variant="flat">
            <View style={styles.statsRow}>
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{vet.completedAppointments}</Text>
                <Text style={styles.statLabel}>Citas completadas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>{vet.totalReviews ?? 0}</Text>
                <Text style={styles.statLabel}>Reseñas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBlock}>
                <Text style={styles.statValue}>
                  {vet.rating ? vet.rating.toFixed(1) : '—'}
                </Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>
          </Card>
        </>
      )}
    </View>
  )
}

// --------- Precios tab ---------
function PricesTab({ prices }: { prices: any[] }) {
  if (prices.length === 0) {
    return (
      <EmptyState
        glyph="$"
        title="Sin lista pública de precios"
        subtitle="El veterinario aún no ha publicado sus servicios. Contáctalo directamente para cotización."
      />
    )
  }
  return (
    <View>
      <SectionHeader
        title="Servicios y precios"
        subtitle="Precios oficiales publicados por el profesional"
      />
      {prices.map((p) => (
        <Card key={p.id} style={{ marginBottom: 8 }}>
          <View style={styles.priceRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.priceName}>{p.serviceName}</Text>
              {p.priceCtg && (
                <Text style={styles.priceCtg}>≈ {p.priceCtg} CTG</Text>
              )}
            </View>
            <Text style={styles.priceCop}>{formatCOP(p.priceCop)}</Text>
          </View>
        </Card>
      ))}
    </View>
  )
}

// --------- Agenda tab ---------
function ScheduleTab({ schedules }: { schedules: any[] }) {
  if (schedules.length === 0) {
    return (
      <EmptyState
        glyph="◷"
        title="Sin horarios configurados"
        subtitle="El veterinario aún no ha publicado su agenda. Puedes solicitar disponibilidad al reservar."
      />
    )
  }
  const DAYS_ES: Record<string, string> = {
    MONDAY: 'Lunes',
    TUESDAY: 'Martes',
    WEDNESDAY: 'Miércoles',
    THURSDAY: 'Jueves',
    FRIDAY: 'Viernes',
    SATURDAY: 'Sábado',
    SUNDAY: 'Domingo',
  }
  return (
    <View>
      <SectionHeader title="Horario semanal" />
      <Card>
        {schedules.map((s, idx) => (
          <View
            key={s.id}
            style={[
              styles.scheduleRow,
              idx === schedules.length - 1 && { borderBottomWidth: 0 },
            ]}
          >
            <Text style={styles.scheduleDay}>{DAYS_ES[s.dayOfWeek] ?? s.dayOfWeek}</Text>
            <Text style={styles.scheduleHours}>
              {s.startTime} – {s.endTime}
            </Text>
          </View>
        ))}
      </Card>
    </View>
  )
}

// --------- Reseñas tab ---------
function ReviewsTab({
  reviews,
  totalReviews,
}: {
  reviews: any[]
  totalReviews: number
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        glyph="✦"
        title="Aún no hay reseñas"
        subtitle="Sé uno de los primeros en compartir tu experiencia con este profesional."
      />
    )
  }
  return (
    <View>
      <SectionHeader
        title="Reseñas de clientes"
        subtitle={`${totalReviews} ${totalReviews === 1 ? 'reseña' : 'reseñas'} en total`}
      />
      {reviews.map((r) => (
        <Card key={r.id} style={{ marginBottom: 8 }}>
          <View style={styles.reviewHead}>
            <Text style={styles.reviewName}>
              {r.client?.firstName ?? 'Cliente'} {r.client?.lastName ?? ''}
            </Text>
            <Text style={styles.reviewStars}>{formatRatingStars(r.rating)}</Text>
          </View>
          <Text style={styles.reviewDate}>
            {formatRelativeTime(r.createdAt)}
          </Text>
          {r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
        </Card>
      ))}
    </View>
  )
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderLight,
    backgroundColor: UI_COLORS.bg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 24, color: UI_COLORS.text },
  headerTitle: { fontSize: 16, fontWeight: '600', color: UI_COLORS.text },

  content: { padding: 16, paddingBottom: 120 },

  skelCard: {
    flexDirection: 'row',
    backgroundColor: UI_COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.borderLight,
  },

  tabBar: {
    flexDirection: 'row',
    marginTop: 12,
    backgroundColor: UI_COLORS.card,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: UI_COLORS.sage },
  tabText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.muted },
  tabTextActive: { color: '#fff' },

  tabContent: { marginTop: 8 },

  bio: { fontSize: 14, color: UI_COLORS.text, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderLight,
  },
  factLabel: { fontSize: 13, color: UI_COLORS.muted },
  factValue: { fontSize: 13, color: UI_COLORS.text, fontWeight: '600' },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBlock: { alignItems: 'center', flex: 1 },
  statDivider: { width: 1, height: 36, backgroundColor: UI_COLORS.border },
  statValue: { fontSize: 22, fontWeight: '700', color: UI_COLORS.sage },
  statLabel: { fontSize: 11, color: UI_COLORS.muted, marginTop: 2 },

  priceRow: { flexDirection: 'row', alignItems: 'center' },
  priceName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.text },
  priceCtg: { fontSize: 11, color: UI_COLORS.gold, marginTop: 2, fontWeight: '600' },
  priceCop: { fontSize: 16, fontWeight: '700', color: UI_COLORS.sage },

  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderLight,
  },
  scheduleDay: { fontSize: 14, color: UI_COLORS.text, fontWeight: '600' },
  scheduleHours: { fontSize: 14, color: UI_COLORS.muted },

  reviewHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewName: { fontSize: 14, fontWeight: '600', color: UI_COLORS.text },
  reviewStars: { fontSize: 13, color: UI_COLORS.gold, letterSpacing: 1 },
  reviewDate: { fontSize: 11, color: UI_COLORS.muted, marginTop: 2 },
  reviewComment: {
    fontSize: 14,
    color: UI_COLORS.text,
    lineHeight: 20,
    marginTop: 8,
  },

  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: UI_COLORS.card,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.border,
  },
})
