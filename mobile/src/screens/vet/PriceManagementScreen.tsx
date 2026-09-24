import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Button,
  Badge,
  Skeleton,
  EmptyState,
  UI_COLORS,
} from '../../components/ui/primitives'
import { useMyPricesQuery } from '../../hooks/queries/useMobileQueries'
import {
  useCreatePriceMutation,
  useUpdatePriceMutation,
  useDeletePriceMutation,
} from '../../hooks/queries/useMobileMutations'
import vetService, { type SuggestedService } from '../../services/vet.service'
import { formatCOP, formatCTG } from '../../utils/format'

/**
 * CRUD de servicios y precios del vet.
 *
 * Nvet ofrece un catálogo de referencias sugeridas, pero el veterinario fija
 * siempre el precio final. El equivalente CTG se calcula en backend para
 * mantener una única tasa canónica de conversión.
 */

interface Props {
  navigation: any
}

interface PriceForm {
  serviceCode: string | null
  serviceName: string
  priceCop: string
}

const EMPTY_FORM: PriceForm = {
  serviceCode: null,
  serviceName: '',
  priceCop: '',
}

export default function PriceManagementScreen({ navigation }: Props) {
  const pricesQuery = useMyPricesQuery()
  const createMutation = useCreatePriceMutation()
  const updateMutation = useUpdatePriceMutation()
  const deleteMutation = useDeletePriceMutation()

  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<PriceForm>(EMPTY_FORM)
  const [suggestions, setSuggestions] = useState<SuggestedService[]>([])
  const [catalogDisclaimer, setCatalogDisclaimer] = useState(
    'Los valores sugeridos son solo una referencia. Tú defines el precio final.',
  )

  const prices = pricesQuery.data ?? []

  useEffect(() => {
    let alive = true
    vetService
      .getServiceCatalog()
      .then((catalog) => {
        if (!alive) return
        setSuggestions(catalog.services)
        setCatalogDisclaimer(catalog.disclaimer)
      })
      .catch(() => {
        // El CRUD sigue disponible aunque el catálogo orientativo falle.
      })
    return () => {
      alive = false
    }
  }, [])

  const openNewForm = useCallback(() => {
    setEditingId('new')
    setForm(EMPTY_FORM)
  }, [])

  const openSuggestedForm = useCallback((suggestion: SuggestedService) => {
    setEditingId('new')
    setForm({
      serviceCode: suggestion.code,
      serviceName: suggestion.name,
      priceCop: String(suggestion.suggestedPriceCop),
    })
  }, [])

  const openEditForm = useCallback((price: any) => {
    setEditingId(price.id)
    setForm({
      serviceCode: price.serviceCode ?? null,
      serviceName: price.serviceName,
      priceCop: String(price.priceCop),
    })
  }, [])

  const cancelForm = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }, [])

  const handleSubmit = useCallback(async () => {
    const trimmed = form.serviceName.trim()
    const cop = parseInt(form.priceCop.replace(/[^\d]/g, ''), 10)

    if (trimmed.length < 2) {
      Alert.alert('Servicio inválido', 'Escribe un nombre de al menos 2 caracteres.')
      return
    }
    if (isNaN(cop) || cop < 5000) {
      Alert.alert('Precio inválido', 'El precio mínimo técnico es $5.000 COP.')
      return
    }

    try {
      const payload = {
        serviceCode: form.serviceCode ?? undefined,
        serviceName: trimmed,
        priceCop: cop,
      }

      if (editingId === 'new') {
        await createMutation.mutateAsync(payload as any)
      } else if (editingId) {
        await updateMutation.mutateAsync({
          priceId: editingId,
          data: payload as any,
        })
      }
      cancelForm()
    } catch (err: any) {
      Alert.alert(
        'Error',
        err?.response?.data?.message ||
          'No pudimos guardar el precio. Intenta de nuevo.',
      )
    }
  }, [editingId, form, createMutation, updateMutation, cancelForm])

  const handleToggleActive = useCallback(
    (price: any) => {
      updateMutation.mutate({
        priceId: price.id,
        data: { isActive: !price.isActive },
      })
    },
    [updateMutation],
  )

  const handleDelete = useCallback(
    (price: any) => {
      Alert.alert(
        'Eliminar servicio',
        `¿Seguro que quieres eliminar "${price.serviceName}"? Esta acción no se puede deshacer.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => {
              deleteMutation.mutate(price.id, {
                onError: (err: any) => {
                  Alert.alert(
                    'Error',
                    err?.response?.data?.message ??
                      'No pudimos eliminar el servicio.',
                  )
                },
              })
            },
          },
        ],
      )
    },
    [deleteMutation],
  )

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Mis servicios</Text>
          <Text style={styles.subtitle}>
            Nvet orienta. Tú decides cuánto cobrar.
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <FlatList
          data={prices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <Card variant="flat">
                <Text style={styles.guidanceTitle}>Precios sugeridos por Nvet</Text>
                <Text style={styles.guidanceText}>{catalogDisclaimer}</Text>
                {suggestions.length > 0 && (
                  <View style={styles.suggestionsWrap}>
                    {suggestions.map((service) => (
                      <Pressable
                        key={service.code}
                        onPress={() => openSuggestedForm(service)}
                        style={styles.suggestionChip}
                        accessibilityRole="button"
                        accessibilityLabel={`Usar referencia ${service.name}`}
                      >
                        <Text style={styles.suggestionName}>{service.name}</Text>
                        <Text style={styles.suggestionPrice}>
                          {service.priceType === 'FROM' ? 'Desde ' : ''}
                          {formatCOP(service.suggestedPriceCop)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Card>

              {editingId === 'new' && (
                <View style={{ marginTop: 12 }}>
                  <PriceEditor
                    form={form}
                    onChange={setForm}
                    onSubmit={handleSubmit}
                    onCancel={cancelForm}
                    isSubmitting={isSubmitting}
                    isSuggested={!!form.serviceCode}
                  />
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => {
            if (editingId === item.id) {
              return (
                <PriceEditor
                  form={form}
                  onChange={setForm}
                  onSubmit={handleSubmit}
                  onCancel={cancelForm}
                  isSubmitting={isSubmitting}
                  isEdit
                  isSuggested={!!form.serviceCode}
                />
              )
            }
            return (
              <PriceCard
                price={item}
                onEdit={() => openEditForm(item)}
                onDelete={() => handleDelete(item)}
                onToggleActive={() => handleToggleActive(item)}
              />
            )
          }}
          ListEmptyComponent={
            pricesQuery.isLoading ? (
              <View style={{ gap: 8 }}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} width="100%" height={70} borderRadius={12} />
                ))}
              </View>
            ) : (
              <EmptyState
                glyph="📋"
                title="Sin servicios configurados"
                subtitle="Usa una referencia de Nvet o crea un servicio personalizado."
                actionLabel="Crear servicio personalizado"
                onAction={openNewForm}
              />
            )
          }
          ListFooterComponent={
            editingId !== 'new' && prices.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                <Pressable
                  onPress={openNewForm}
                  style={styles.addBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Agregar servicio personalizado"
                >
                  <Text style={styles.addBtnText}>+ Servicio personalizado</Text>
                </Pressable>
              </View>
            ) : undefined
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

interface PriceCardProps {
  price: any
  onEdit: () => void
  onDelete: () => void
  onToggleActive: () => void
}

function PriceCard({ price, onEdit, onDelete, onToggleActive }: PriceCardProps) {
  const isOptimistic = price._optimistic
  return (
    <View
      style={[
        styles.priceCard,
        !price.isActive && styles.priceCardInactive,
        isOptimistic && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <View style={styles.priceTopRow}>
          <Text
            style={[
              styles.priceServiceName,
              !price.isActive && { color: UI_COLORS.muted },
            ]}
            numberOfLines={1}
          >
            {price.serviceName}
          </Text>
          {price.serviceCode && <Badge label="Nvet" tone="sage" size="sm" />}
          {!price.isActive && <Badge label="Inactivo" tone="muted" size="sm" />}
        </View>
        <View style={styles.priceAmounts}>
          <Text style={styles.priceCop}>{formatCOP(price.priceCop)}</Text>
          <Text style={styles.priceCtg}>· {formatCTG(price.priceCtg)}</Text>
        </View>
      </View>

      <View style={styles.priceActions}>
        <Pressable
          onPress={onToggleActive}
          hitSlop={6}
          accessibilityRole="switch"
          accessibilityState={{ checked: price.isActive }}
          accessibilityLabel={`Activar servicio ${price.serviceName}`}
        >
          <View style={[styles.toggleTrack, price.isActive && styles.toggleTrackActive]}>
            <View style={[styles.toggleThumb, price.isActive && styles.toggleThumbActive]} />
          </View>
        </Pressable>
        <Pressable onPress={onEdit} hitSlop={6} accessibilityRole="button" accessibilityLabel="Editar servicio">
          <Text style={styles.actionLink}>✎</Text>
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={6} accessibilityRole="button" accessibilityLabel="Eliminar servicio">
          <Text style={[styles.actionLink, { color: UI_COLORS.error }]}>×</Text>
        </Pressable>
      </View>
    </View>
  )
}

interface PriceEditorProps {
  form: PriceForm
  onChange: (form: PriceForm) => void
  onSubmit: () => void
  onCancel: () => void
  isSubmitting: boolean
  isEdit?: boolean
  isSuggested?: boolean
}

function PriceEditor({
  form,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  isEdit = false,
  isSuggested = false,
}: PriceEditorProps) {
  return (
    <Card variant="flat">
      <View style={styles.editorTitleRow}>
        <Text style={styles.editorTitle}>
          {isEdit ? 'Editar servicio' : 'Nuevo servicio'}
        </Text>
        {isSuggested && <Badge label="Referencia Nvet" tone="sage" size="sm" />}
      </View>

      <Text style={styles.fieldLabel}>Nombre del servicio</Text>
      <TextInput
        value={form.serviceName}
        onChangeText={(serviceName) =>
          onChange({ ...form, serviceName, serviceCode: null })
        }
        placeholder="Ej. Consulta a domicilio"
        placeholderTextColor={UI_COLORS.muted}
        style={styles.input}
        autoCapitalize="sentences"
        accessibilityLabel="Nombre del servicio"
      />
      {isSuggested && (
        <Text style={styles.helperText}>
          Si cambias el nombre, se guardará como servicio personalizado.
        </Text>
      )}

      <Text style={styles.fieldLabel}>Tu precio final (COP)</Text>
      <TextInput
        value={form.priceCop}
        onChangeText={(priceCop) => onChange({ ...form, priceCop })}
        placeholder="90000"
        placeholderTextColor={UI_COLORS.muted}
        style={styles.input}
        keyboardType="numeric"
        accessibilityLabel="Precio final en pesos colombianos"
      />
      <Text style={styles.helperText}>
        El valor sugerido no es obligatorio. El equivalente CTG se calcula automáticamente.
      </Text>

      <View style={styles.editorActions}>
        <View style={{ flex: 1 }}>
          <Button label="Cancelar" variant="ghost" accent="gold" onPress={onCancel} disabled={isSubmitting} fullWidth />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={isEdit ? 'Guardar cambios' : 'Crear servicio'}
            accent="gold"
            onPress={onSubmit}
            loading={isSubmitting}
            fullWidth
          />
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    gap: 8,
  },
  back: { fontSize: 28, color: UI_COLORS.gold },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  subtitle: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
  content: { padding: 16, flexGrow: 1 },
  guidanceTitle: { fontSize: 14, fontWeight: '800', color: UI_COLORS.text },
  guidanceText: { fontSize: 12, lineHeight: 17, color: UI_COLORS.muted, marginTop: 5 },
  suggestionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  suggestionChip: {
    minWidth: '47%',
    flexGrow: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  suggestionName: { fontSize: 12, fontWeight: '700', color: UI_COLORS.text },
  suggestionPrice: { fontSize: 11, color: UI_COLORS.gold, marginTop: 3, fontWeight: '700' },
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: UI_COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    gap: 12,
  },
  priceCardInactive: { backgroundColor: UI_COLORS.borderLight, borderColor: UI_COLORS.border },
  priceTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  priceServiceName: { fontSize: 15, fontWeight: '700', color: UI_COLORS.text, flex: 1 },
  priceAmounts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceCop: { fontSize: 14, fontWeight: '700', color: UI_COLORS.gold },
  priceCtg: { fontSize: 12, color: UI_COLORS.muted },
  priceActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: UI_COLORS.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackActive: { backgroundColor: UI_COLORS.gold },
  toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: UI_COLORS.card },
  toggleThumbActive: { transform: [{ translateX: 16 }] },
  actionLink: { fontSize: 18, color: UI_COLORS.text, fontWeight: '700', paddingHorizontal: 4 },
  editorTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  editorTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.muted,
    marginTop: 10,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  helperText: { fontSize: 11, lineHeight: 15, color: UI_COLORS.muted, marginTop: 5 },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    fontSize: 14,
    color: UI_COLORS.text,
  },
  editorActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  addBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: UI_COLORS.gold,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addBtnText: { color: UI_COLORS.gold, fontSize: 14, fontWeight: '700' },
})
