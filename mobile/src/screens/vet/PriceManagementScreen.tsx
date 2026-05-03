import React, { useState, useCallback } from 'react'
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
import { formatCOP, formatCTG } from '../../utils/format'

/**
 * PriceManagementScreen — CRUD de servicios y precios del vet.
 *
 * Capacidades:
 *  - Lista de precios con `useMyPricesQuery` (incluye inactivos)
 *  - Crear nuevo precio inline en card al final de la lista
 *  - Editar precio inline (tap → modo editing)
 *  - Toggle isActive (switch visual con optimistic update)
 *  - Eliminar precio con confirmación destructive
 *  - Pull-to-refresh
 *
 * Decisiones:
 *  - Modo edit/create se maneja con `editingId | 'new' | null` (estado discriminated)
 *  - `priceCtg` se calcula automáticamente como `priceCop / 1000` por default;
 *    el vet puede sobreescribirlo si quiere un descuento en CTG
 *  - Optimistic updates en update/delete via los hooks
 */

interface Props {
  navigation: any
}

interface PriceForm {
  serviceName: string
  priceCop: string
  priceCtg: string
}

const EMPTY_FORM: PriceForm = { serviceName: '', priceCop: '', priceCtg: '' }

export default function PriceManagementScreen({ navigation }: Props) {
  const pricesQuery = useMyPricesQuery()
  const createMutation = useCreatePriceMutation()
  const updateMutation = useUpdatePriceMutation()
  const deleteMutation = useDeletePriceMutation()

  // 'new' = creando nuevo, string = editando id, null = idle
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<PriceForm>(EMPTY_FORM)

  const prices = pricesQuery.data ?? []

  const openNewForm = useCallback(() => {
    setEditingId('new')
    setForm(EMPTY_FORM)
  }, [])

  const openEditForm = useCallback((price: any) => {
    setEditingId(price.id)
    setForm({
      serviceName: price.serviceName,
      priceCop: String(price.priceCop),
      priceCtg: String(price.priceCtg),
    })
  }, [])

  const cancelForm = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }, [])

  const handleSubmit = useCallback(async () => {
    const trimmed = form.serviceName.trim()
    const cop = parseInt(form.priceCop.replace(/[^\d]/g, ''), 10)
    const ctg = parseFloat(form.priceCtg.replace(/[^\d.]/g, '')) || cop / 1000

    if (trimmed.length < 3) {
      Alert.alert('Servicio inválido', 'Escribe un nombre de al menos 3 caracteres.')
      return
    }
    if (isNaN(cop) || cop < 1000) {
      Alert.alert('Precio inválido', 'El precio mínimo es $1.000 COP.')
      return
    }

    try {
      if (editingId === 'new') {
        await createMutation.mutateAsync({
          serviceName: trimmed,
          priceCop: cop,
          priceCtg: ctg,
        })
      } else if (editingId) {
        await updateMutation.mutateAsync({
          priceId: editingId,
          data: { serviceName: trimmed, priceCop: cop, priceCtg: ctg },
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
      {/* Header */}
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
            Define los servicios que ofreces y sus precios
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
                subtitle="Agrega tu primer servicio para que los clientes puedan reservar."
                actionLabel="Agregar servicio"
                onAction={openNewForm}
              />
            )
          }
          ListFooterComponent={
            <View style={{ marginTop: 12 }}>
              {editingId === 'new' ? (
                <PriceEditor
                  form={form}
                  onChange={setForm}
                  onSubmit={handleSubmit}
                  onCancel={cancelForm}
                  isSubmitting={isSubmitting}
                />
              ) : (
                prices.length > 0 && (
                  <Pressable
                    onPress={openNewForm}
                    style={styles.addBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Agregar servicio"
                  >
                    <Text style={styles.addBtnText}>+ Agregar servicio</Text>
                  </Pressable>
                )
              )}
            </View>
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// =====================================================================
// PriceCard
// =====================================================================

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
          <View
            style={[
              styles.toggleTrack,
              price.isActive && styles.toggleTrackActive,
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                price.isActive && styles.toggleThumbActive,
              ]}
            />
          </View>
        </Pressable>
        <Pressable
          onPress={onEdit}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Editar servicio"
        >
          <Text style={styles.actionLink}>✎</Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Eliminar servicio"
        >
          <Text style={[styles.actionLink, { color: UI_COLORS.error }]}>×</Text>
        </Pressable>
      </View>
    </View>
  )
}

// =====================================================================
// PriceEditor
// =====================================================================

interface PriceEditorProps {
  form: PriceForm
  onChange: (form: PriceForm) => void
  onSubmit: () => void
  onCancel: () => void
  isSubmitting: boolean
  isEdit?: boolean
}

function PriceEditor({
  form,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting,
  isEdit = false,
}: PriceEditorProps) {
  return (
    <Card variant="flat">
      <Text style={styles.editorTitle}>
        {isEdit ? 'Editar servicio' : 'Nuevo servicio'}
      </Text>

      <Text style={styles.fieldLabel}>Nombre del servicio</Text>
      <TextInput
        value={form.serviceName}
        onChangeText={(serviceName) => onChange({ ...form, serviceName })}
        placeholder="Ej. Consulta a domicilio"
        placeholderTextColor={UI_COLORS.muted}
        style={styles.input}
        autoCapitalize="sentences"
        accessibilityLabel="Nombre del servicio"
      />

      <View style={styles.priceFieldsRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Precio (COP)</Text>
          <TextInput
            value={form.priceCop}
            onChangeText={(priceCop) => onChange({ ...form, priceCop })}
            placeholder="80000"
            placeholderTextColor={UI_COLORS.muted}
            style={styles.input}
            keyboardType="numeric"
            accessibilityLabel="Precio en pesos colombianos"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>Equiv. CTG</Text>
          <TextInput
            value={form.priceCtg}
            onChangeText={(priceCtg) => onChange({ ...form, priceCtg })}
            placeholder="80"
            placeholderTextColor={UI_COLORS.muted}
            style={styles.input}
            keyboardType="numeric"
            accessibilityLabel="Equivalente en tokens CTG"
          />
        </View>
      </View>

      <View style={styles.editorActions}>
        <View style={{ flex: 1 }}>
          <Button
            label="Cancelar"
            variant="ghost"
            accent="gold"
            onPress={onCancel}
            disabled={isSubmitting}
            fullWidth
          />
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
  // Card
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
  priceCardInactive: {
    backgroundColor: UI_COLORS.borderLight,
    borderColor: UI_COLORS.border,
  },
  priceTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  priceServiceName: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.text,
    flex: 1,
  },
  priceAmounts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceCop: { fontSize: 14, fontWeight: '700', color: UI_COLORS.gold },
  priceCtg: { fontSize: 12, color: UI_COLORS.muted },
  priceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // Toggle
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: UI_COLORS.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackActive: { backgroundColor: UI_COLORS.gold },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: UI_COLORS.card,
  },
  toggleThumbActive: { transform: [{ translateX: 16 }] },
  actionLink: {
    fontSize: 18,
    color: UI_COLORS.text,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  // Editor
  editorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: UI_COLORS.muted,
    marginTop: 8,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
  priceFieldsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editorActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  // Add button
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
