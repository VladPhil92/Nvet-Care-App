import React, { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FlatList } from 'react-native'

import VetCard, { VetCardData } from '../../components/vet/VetCard'
import { Badge, Skeleton, EmptyState, UI_COLORS } from '../../components/ui/primitives'
import { useInfiniteVetSearchQuery } from '../../hooks/queries/useMobileQueries'

/**
 * SearchVetsScreen — descubrimiento de veterinarios con filtros y scroll infinito.
 *
 * Tradeoff sobre `FlashList`:
 *  - Sería ideal para listas largas, pero requiere `@shopify/flash-list` como
 *    dependencia adicional. Por ahora usamos `FlatList` con `windowSize`,
 *    `removeClippedSubviews` y `getItemLayout` (cuando posible) para
 *    performance aceptable. Migración a FlashList trivial cuando se instale.
 *
 * Estados manejados:
 *  - Initial loading: skeletons (5 cards)
 *  - Empty (no results): EmptyState con CTA limpiar filtros
 *  - Loading next page: ActivityIndicator en footer
 *  - Error: EmptyState con CTA retry
 *  - Refreshing (pull-to-refresh): refetch primera página
 */

const SPECIALTIES = [
  'Medicina general',
  'Felinos',
  'Caninos',
  'Cirugía',
  'Dermatología',
  'Vacunación',
  'Emergencias',
  'Comportamiento',
] as const

type SortBy = 'relevance' | 'rating' | 'distance' | 'price_asc' | 'experience'

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: 'relevance', label: 'Relevancia' },
  { value: 'rating', label: 'Mejor calificación' },
  { value: 'distance', label: 'Más cercanos' },
  { value: 'price_asc', label: 'Menor precio' },
  { value: 'experience', label: 'Más experiencia' },
]

interface SearchVetsScreenProps {
  navigation: {
    navigate: (route: string, params?: any) => void
  }
}

export default function SearchVetsScreen({ navigation }: SearchVetsScreenProps) {
  const [searchText, setSearchText] = useState('')
  const [activeSpecialty, setActiveSpecialty] = useState<string | null>(null)
  const [availableNow, setAvailableNow] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('relevance')

  // Filtros derivados — reactivos al state
  const filters = useMemo(
    () => ({
      search: searchText.trim() || undefined,
      specialty: activeSpecialty ?? undefined,
      availableNow: availableNow || undefined,
      sortBy,
    }),
    [searchText, activeSpecialty, availableNow, sortBy],
  )

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isRefetching,
  } = useInfiniteVetSearchQuery(filters)

  // Aplanar las páginas en una sola lista
  const allVets: VetCardData[] = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page: any) => {
      const results = page?.results ?? []
      return results.map((v: any) => ({
        id: v.id,
        firstName: v.user?.firstName,
        lastName: v.user?.lastName,
        avatar: v.user?.avatar,
        tier: v.tier,
        rating: v.rating,
        reviewCount: v.totalReviews,
        yearsExperience: v.yearsExperience,
        specialties: v.specialties,
        startingPriceCop: v.prices?.[0]?.priceCop,
        distanceKm: v.distance,
        isAvailableNow: v.isAvailableNow,
        city: v.city,
      }))
    })
  }, [data])

  const totalCount = data?.pages?.[0]?.total ?? 0

  // Handlers memoizados
  const handleVetPress = useCallback(
    (vetId: string) => {
      navigation.navigate('VetDetail', { vetId })
    },
    [navigation],
  )

  const clearFilters = useCallback(() => {
    setSearchText('')
    setActiveSpecialty(null)
    setAvailableNow(false)
    setSortBy('relevance')
  }, [])

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header con search */}
      <View style={styles.header}>
        <Text style={styles.title}>Veterinarios</Text>
        {totalCount > 0 && !isPending && (
          <Text style={styles.subtitle}>
            {totalCount} {totalCount === 1 ? 'profesional' : 'profesionales'} disponibles
          </Text>
        )}

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Buscar por nombre o especialidad…"
            placeholderTextColor={UI_COLORS.muted}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Buscar veterinarios"
          />
          {searchText.length > 0 && (
            <Pressable
              onPress={() => setSearchText('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Limpiar búsqueda"
            >
              <Text style={styles.clearIcon}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Filtros */}
      <View style={styles.filtersWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          accessibilityLabel="Filtros por especialidad"
        >
          <FilterChip
            label="Disponible ahora"
            active={availableNow}
            onPress={() => setAvailableNow(!availableNow)}
            accent="success"
            icon="●"
          />
          {SPECIALTIES.map((s) => (
            <FilterChip
              key={s}
              label={s}
              active={activeSpecialty === s}
              onPress={() => setActiveSpecialty(activeSpecialty === s ? null : s)}
            />
          ))}
        </ScrollView>

        {/* Sort selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chipRow, { paddingTop: 4 }]}
          accessibilityLabel="Ordenar resultados"
        >
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setSortBy(opt.value)}
              style={[styles.sortChip, sortBy === opt.value && styles.sortChipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: sortBy === opt.value }}
              accessibilityLabel={`Ordenar por ${opt.label}`}
            >
              <Text
                style={[
                  styles.sortChipText,
                  sortBy === opt.value && styles.sortChipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Lista */}
      {isPending ? (
        <View style={styles.listContainer}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonVetCard key={i} />
          ))}
        </View>
      ) : isError ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="⚠"
            title="No pudimos cargar los veterinarios"
            subtitle={(error as Error)?.message ?? 'Verifica tu conexión e intenta de nuevo'}
            actionLabel="Reintentar"
            onAction={() => refetch()}
          />
        </View>
      ) : allVets.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            glyph="◌"
            title="Sin resultados"
            subtitle="Intenta cambiar los filtros o ampliar tu búsqueda"
            actionLabel="Limpiar filtros"
            onAction={clearFilters}
          />
        </View>
      ) : (
        <FlatList
          data={allVets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <VetCard vet={item} onPress={() => handleVetPress(item.id)} />
          )}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isFetchingNextPage}
              onRefresh={refetch}
              tintColor={UI_COLORS.sage}
              colors={[UI_COLORS.sage]}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footer}>
                <ActivityIndicator color={UI_COLORS.sage} />
                <Text style={styles.footerText}>Cargando más…</Text>
              </View>
            ) : !hasNextPage && allVets.length > 5 ? (
              <Text style={styles.footerEnd}>— Fin de los resultados —</Text>
            ) : null
          }
          // Performance hints
          removeClippedSubviews
          windowSize={11}
          maxToRenderPerBatch={10}
          initialNumToRender={8}
        />
      )}
    </SafeAreaView>
  )
}

// ============================================================
// SUBCOMPONENTS
// ============================================================

interface FilterChipProps {
  label: string
  active: boolean
  onPress: () => void
  accent?: 'sage' | 'success'
  icon?: string
}

function FilterChip({
  label,
  active,
  onPress,
  accent = 'sage',
  icon,
}: FilterChipProps) {
  const accentColor = accent === 'success' ? UI_COLORS.success : UI_COLORS.sage
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        active && {
          backgroundColor: accentColor,
          borderColor: accentColor,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}${active ? ' activo' : ''}`}
    >
      {icon && (
        <Text style={[styles.chipIcon, { color: active ? '#fff' : accentColor }]}>
          {icon}
        </Text>
      )}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

function SkeletonVetCard() {
  return (
    <View style={[styles.skelCard]}>
      <Skeleton width={56} height={56} borderRadius={14} />
      <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
        <Skeleton width={'70%'} height={16} />
        <Skeleton width={'50%'} height={12} />
        <Skeleton width={'40%'} height={12} />
      </View>
    </View>
  )
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: { padding: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.text },
  subtitle: { fontSize: 13, color: UI_COLORS.muted, marginTop: 2, marginBottom: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: UI_COLORS.card,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  searchIcon: { fontSize: 18, color: UI_COLORS.muted, marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: UI_COLORS.text,
    height: '100%',
  },
  clearIcon: { fontSize: 16, color: UI_COLORS.muted, paddingHorizontal: 4 },
  filtersWrapper: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.borderLight,
  },
  chipRow: { paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingVertical: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    minHeight: 36,
  },
  chipIcon: { fontSize: 8 },
  chipText: { fontSize: 13, fontWeight: '600', color: UI_COLORS.text },
  chipTextActive: { color: '#fff' },
  sortChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  sortChipActive: { backgroundColor: '#5B75531a' },
  sortChipText: { fontSize: 12, fontWeight: '600', color: UI_COLORS.muted },
  sortChipTextActive: { color: UI_COLORS.sage },
  listContainer: { padding: 16, paddingBottom: 32 },
  skelCard: {
    flexDirection: 'row',
    backgroundColor: UI_COLORS.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.borderLight,
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  footerText: { fontSize: 12, color: UI_COLORS.muted },
  footerEnd: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 12,
    color: UI_COLORS.muted,
  },
})
