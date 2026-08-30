import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

import VetCard, { VetCardData } from '../../components/vet/VetCard'
import { Skeleton, EmptyState, UI_COLORS } from '../../components/ui/primitives'
import { useInfiniteVetSearchQuery } from '../../hooks/queries/useMobileQueries'
import liveLocationService, {
  Coordinates,
} from '../../services/live-location.service'
import type { ClientSearchStackParamList } from '../../navigation/types'

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

type SearchVetsScreenProps = NativeStackScreenProps<
  ClientSearchStackParamList,
  'SearchMain'
>

export default function SearchVetsScreen({ navigation, route }: SearchVetsScreenProps) {
  const [searchText, setSearchText] = useState('')
  const [activeSpecialty, setActiveSpecialty] = useState<string | null>(
    route.params?.specialty ?? null,
  )
  const [availableNow, setAvailableNow] = useState(
    route.params?.availableNow ?? false,
  )
  const [sortBy, setSortBy] = useState<SortBy>('relevance')
  const [deviceLocation, setDeviceLocation] = useState<Coordinates | null>(null)
  const [locationResolved, setLocationResolved] = useState(false)

  useEffect(() => {
    const presetSpecialty = route.params?.specialty
    const presetAvailableNow = route.params?.availableNow

    if (presetSpecialty === undefined && presetAvailableNow === undefined) return

    setActiveSpecialty(presetSpecialty ?? null)
    setAvailableNow(presetAvailableNow ?? false)

    // Consumir el preset una sola vez. De este modo, volver desde el detalle no
    // reimpone filtros que el usuario haya cambiado manualmente, mientras una
    // nueva entrada desde Emergencias puede suministrarlos de nuevo.
    navigation.setParams({
      specialty: undefined,
      availableNow: undefined,
    })
  }, [navigation, route.params?.specialty, route.params?.availableNow])

  useEffect(() => {
    let mounted = true
    liveLocationService
      .getDeviceCoordinates()
      .then((coords) => {
        if (!mounted) return
        setDeviceLocation(coords)
        setLocationResolved(true)
      })
      .catch(() => {
        if (!mounted) return
        setDeviceLocation(null)
        setLocationResolved(true)
      })

    return () => {
      mounted = false
    }
  }, [])

  const filters = useMemo(
    () => ({
      search: searchText.trim() || undefined,
      specialty: activeSpecialty ?? undefined,
      availableNow: availableNow || undefined,
      sortBy,
      latitude: deviceLocation?.latitude,
      longitude: deviceLocation?.longitude,
      radiusKm: deviceLocation ? 20 : undefined,
    }),
    [searchText, activeSpecialty, availableNow, sortBy, deviceLocation],
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

  const handleVetPress = useCallback(
    (vetId: string) => navigation.navigate('VetDetail', { vetId }),
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

  const retryLocation = useCallback(async () => {
    setLocationResolved(false)
    try {
      const coords = await liveLocationService.getDeviceCoordinates()
      setDeviceLocation(coords)
      if (coords) setSortBy('distance')
    } finally {
      setLocationResolved(true)
    }
  }, [])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Veterinarios</Text>
        {totalCount > 0 && !isPending && (
          <Text style={styles.subtitle}>
            {totalCount} {totalCount === 1 ? 'profesional' : 'profesionales'} disponibles
          </Text>
        )}

        <Pressable
          onPress={retryLocation}
          style={styles.locationRow}
          accessibilityRole="button"
          accessibilityLabel="Actualizar ubicación para búsqueda de veterinarios cercanos"
        >
          <Text style={styles.locationIcon}>⌖</Text>
          <Text style={styles.locationText}>
            {!locationResolved
              ? 'Obteniendo ubicación…'
              : deviceLocation
                ? 'Ubicación activa · resultados por proximidad disponibles'
                : 'Activa ubicación para ordenar veterinarios por cercanía'}
          </Text>
        </Pressable>

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
          {SPECIALTIES.map((specialty) => (
            <FilterChip
              key={specialty}
              label={specialty}
              active={activeSpecialty === specialty}
              onPress={() =>
                setActiveSpecialty(activeSpecialty === specialty ? null : specialty)
              }
            />
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chipRow, { paddingTop: 4 }]}
          accessibilityLabel="Ordenar resultados"
        >
          {SORT_OPTIONS.map((option) => {
            const distanceDisabled = option.value === 'distance' && !deviceLocation
            return (
              <Pressable
                key={option.value}
                onPress={() => !distanceDisabled && setSortBy(option.value)}
                disabled={distanceDisabled}
                style={[
                  styles.sortChip,
                  sortBy === option.value && styles.sortChipActive,
                  distanceDisabled && styles.sortChipDisabled,
                ]}
                accessibilityRole="radio"
                accessibilityState={{
                  selected: sortBy === option.value,
                  disabled: distanceDisabled,
                }}
                accessibilityLabel={`Ordenar por ${option.label}`}
              >
                <Text
                  style={[
                    styles.sortChipText,
                    sortBy === option.value && styles.sortChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

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
          removeClippedSubviews
          windowSize={11}
          maxToRenderPerBatch={10}
          initialNumToRender={8}
        />
      )}
    </SafeAreaView>
  )
}

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
        active && { backgroundColor: accentColor, borderColor: accentColor },
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
    <View style={styles.skelCard}>
      <Skeleton width={56} height={56} borderRadius={14} />
      <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="50%" height={12} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: { padding: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: UI_COLORS.text },
  subtitle: { fontSize: 13, color: UI_COLORS.muted, marginTop: 2, marginBottom: 8 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  locationIcon: { fontSize: 16, color: UI_COLORS.sage },
  locationText: { flex: 1, fontSize: 11, color: UI_COLORS.muted },
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
  searchInput: { flex: 1, fontSize: 15, color: UI_COLORS.text, height: '100%' },
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
  sortChipDisabled: { opacity: 0.4 },
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
  footer: { paddingVertical: 24, alignItems: 'center', gap: 8 },
  footerText: { fontSize: 12, color: UI_COLORS.muted },
  footerEnd: {
    textAlign: 'center',
    paddingVertical: 24,
    fontSize: 12,
    color: UI_COLORS.muted,
  },
})
