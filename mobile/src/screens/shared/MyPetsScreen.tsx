/**
 * MyPetsScreen — Gestión de mascotas del usuario.
 *
 * Funcionalidades:
 *  - Lista de mascotas del cliente con foto, nombre, especie y raza
 *  - Botón "Agregar mascota" que abre un modal inline de creación
 *  - Edición inline (modal) con los campos editables
 *  - Eliminación con confirmación (solo si no tiene citas activas)
 *  - Pull-to-refresh para actualizar la lista
 *  - Estado vacío con CTA motivador
 *
 * Las operaciones usan optimistic updates via React Query — la lista
 * se actualiza inmediatamente sin esperar la respuesta del backend.
 */

import React, { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '../../theme/colors'
import { Icon } from '../../components/common/Icon'
import {
  useMyPetsQuery,
  usePetDetailQuery,
} from '../../hooks/queries/useMobileQueries'
import {
  useCreatePetMutation,
  useUpdatePetMutation,
  useDeletePetMutation,
} from '../../hooks/queries/useMobileMutations'
import type { Pet } from '../../services/pet.service'

const SPECIES_OPTIONS = [
  { value: 'DOG', label: '🐕 Perro' },
  { value: 'CAT', label: '🐈 Gato' },
  { value: 'BIRD', label: '🐦 Ave' },
  { value: 'RABBIT', label: '🐇 Conejo' },
  { value: 'REPTILE', label: '🦎 Reptil' },
  { value: 'FISH', label: '🐟 Pez' },
  { value: 'OTHER', label: '🐾 Otro' },
]

const SPECIES_EMOJI: Record<string, string> = {
  DOG: '🐕', CAT: '🐈', BIRD: '🐦', RABBIT: '🐇',
  REPTILE: '🦎', FISH: '🐟', OTHER: '🐾',
}

interface PetFormData {
  name: string
  species: string
  breed: string
  weight: string
  notes: string
}

const EMPTY_FORM: PetFormData = {
  name: '', species: 'DOG', breed: '', weight: '', notes: '',
}

interface Props {
  navigation: any
}

export default function MyPetsScreen({ navigation }: Props) {
  const petsQ = useMyPetsQuery()
  const createMut = useCreatePetMutation()
  const updateMut = useUpdatePetMutation()
  const deleteMut = useDeletePetMutation()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingPet, setEditingPet] = useState<Pet | null>(null)
  const [form, setForm] = useState<PetFormData>(EMPTY_FORM)
  const [speciesOpen, setSpeciesOpen] = useState(false)

  const openCreate = useCallback(() => {
    setEditingPet(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((pet: Pet) => {
    setEditingPet(pet)
    setForm({
      name: pet.name,
      species: pet.species,
      breed: pet.breed ?? '',
      weight: pet.weight ? String(pet.weight) : '',
      notes: pet.notes ?? '',
    })
    setModalOpen(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      Alert.alert('Campo requerido', 'El nombre de la mascota es obligatorio.')
      return
    }

    const payload = {
      name: form.name.trim(),
      species: form.species,
      breed: form.breed.trim() || undefined,
      weight: form.weight ? parseFloat(form.weight) : undefined,
      notes: form.notes.trim() || undefined,
    }

    try {
      if (editingPet) {
        await updateMut.mutateAsync({ petId: editingPet.id, data: payload })
        Alert.alert('✓ Guardado', `Datos de ${form.name} actualizados.`)
      } else {
        await createMut.mutateAsync(payload)
        Alert.alert('✓ Mascota agregada', `${form.name} ya está en tu perfil.`)
      }
      setModalOpen(false)
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message ?? 'No se pudo guardar. Intenta de nuevo.')
    }
  }, [form, editingPet, createMut, updateMut])

  const handleDelete = useCallback((pet: Pet) => {
    Alert.alert(
      `Eliminar a ${pet.name}`,
      'Esta acción no se puede deshacer. Si tiene citas activas, cancélalas primero.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMut.mutateAsync(pet.id)
            } catch (e: any) {
              Alert.alert(
                'No se puede eliminar',
                e?.response?.data?.message ?? 'Intenta de nuevo.',
              )
            }
          },
        },
      ],
    )
  }, [deleteMut])

  const onRefresh = useCallback(() => {
    petsQ.refetch()
  }, [petsQ])

  // -----------------------------------------------------------------
  // RENDER HELPERS
  // -----------------------------------------------------------------

  const renderPetCard = useCallback(({ item: pet }: { item: Pet }) => (
    <View style={styles.petCard}>
      <View style={styles.petAvatar}>
        <Text style={styles.petEmoji}>{SPECIES_EMOJI[pet.species] ?? '🐾'}</Text>
      </View>
      <View style={styles.petInfo}>
        <Text style={styles.petName}>{pet.name}</Text>
        <Text style={styles.petDetail}>
          {SPECIES_OPTIONS.find((s) => s.value === pet.species)?.label.split(' ')[1] ?? pet.species}
          {pet.breed ? ` · ${pet.breed}` : ''}
        </Text>
        {pet.weight ? (
          <Text style={styles.petWeight}>{pet.weight} kg</Text>
        ) : null}
      </View>
      <View style={styles.petActions}>
        <Pressable
          onPress={() => openEdit(pet)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Editar a ${pet.name}`}
          style={styles.actionBtn}
        >
          <Icon name="edit" size={18} color={Colors.sage} />
        </Pressable>
        <Pressable
          onPress={() => handleDelete(pet)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar a ${pet.name}`}
          style={styles.actionBtn}
        >
          <Icon name="trash" size={18} color={Colors.err} />
        </Pressable>
      </View>
    </View>
  ), [openEdit, handleDelete])

  const EmptyState = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>🐾</Text>
      <Text style={styles.emptyTitle}>Sin mascotas registradas</Text>
      <Text style={styles.emptySubtitle}>
        Agrega a tu compañero peludo para agendar citas más rápido.
      </Text>
      <Pressable
        style={styles.emptyBtn}
        onPress={openCreate}
        accessibilityRole="button"
        accessibilityLabel="Agregar primera mascota"
      >
        <Icon name="plus" size={18} color="#fff" />
        <Text style={styles.emptyBtnText}>Agregar mascota</Text>
      </Pressable>
    </View>
  )

  // -----------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={styles.backBtn}
        >
          <Icon name="arrow-left" size={24} color={Colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Mis mascotas</Text>
        <Pressable
          onPress={openCreate}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Agregar mascota"
          style={styles.addBtn}
        >
          <Icon name="plus" size={22} color={Colors.sage} />
        </Pressable>
      </View>

      {/* Lista */}
      <FlatList
        data={petsQ.data ?? []}
        keyExtractor={(p) => p.id}
        renderItem={renderPetCard}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={petsQ.isLoading ? null : <EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={petsQ.isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.sage}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Modal de creación / edición */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOpen(false)}
      >
        <SafeAreaView style={styles.modal} edges={['top']}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Pressable
                onPress={() => setModalOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
              >
                <Text style={styles.modalCancel}>Cancelar</Text>
              </Pressable>
              <Text style={styles.modalTitle}>
                {editingPet ? `Editar a ${editingPet.name}` : 'Nueva mascota'}
              </Text>
              <Pressable
                onPress={handleSave}
                disabled={createMut.isPending || updateMut.isPending}
                accessibilityRole="button"
                accessibilityLabel="Guardar"
              >
                <Text
                  style={[
                    styles.modalSave,
                    (createMut.isPending || updateMut.isPending) && { opacity: 0.5 },
                  ]}
                >
                  {createMut.isPending || updateMut.isPending ? '...' : 'Guardar'}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Nombre */}
              <Text style={styles.fieldLabel}>Nombre *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder="Ej: Max, Luna, Simba..."
                placeholderTextColor={Colors.inkMuted}
                maxLength={50}
                returnKeyType="next"
              />

              {/* Especie */}
              <Text style={styles.fieldLabel}>Especie *</Text>
              <Pressable
                style={styles.selector}
                onPress={() => setSpeciesOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityLabel="Seleccionar especie"
              >
                <Text style={styles.selectorText}>
                  {SPECIES_OPTIONS.find((s) => s.value === form.species)?.label ?? 'Seleccionar...'}
                </Text>
                <Icon
                  name={speciesOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.inkMuted}
                />
              </Pressable>

              {speciesOpen && (
                <View style={styles.speciesDropdown}>
                  {SPECIES_OPTIONS.map((s) => (
                    <Pressable
                      key={s.value}
                      style={[
                        styles.speciesOption,
                        form.species === s.value && styles.speciesOptionActive,
                      ]}
                      onPress={() => {
                        setForm((f) => ({ ...f, species: s.value }))
                        setSpeciesOpen(false)
                      }}
                    >
                      <Text
                        style={[
                          styles.speciesOptionText,
                          form.species === s.value && styles.speciesOptionTextActive,
                        ]}
                      >
                        {s.label}
                      </Text>
                      {form.species === s.value && (
                        <Icon name="check" size={16} color={Colors.sage} />
                      )}
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Raza */}
              <Text style={styles.fieldLabel}>Raza (opcional)</Text>
              <TextInput
                style={styles.input}
                value={form.breed}
                onChangeText={(v) => setForm((f) => ({ ...f, breed: v }))}
                placeholder="Ej: Labrador, Persa, Sin raza..."
                placeholderTextColor={Colors.inkMuted}
                maxLength={100}
                returnKeyType="next"
              />

              {/* Peso */}
              <Text style={styles.fieldLabel}>Peso en kg (opcional)</Text>
              <TextInput
                style={styles.input}
                value={form.weight}
                onChangeText={(v) => setForm((f) => ({ ...f, weight: v }))}
                placeholder="Ej: 5.2"
                placeholderTextColor={Colors.inkMuted}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />

              {/* Notas */}
              <Text style={styles.fieldLabel}>Notas del vet (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={form.notes}
                onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="Condiciones médicas, alergias, temperamento..."
                placeholderTextColor={Colors.inkMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />

              <Text style={styles.charCount}>{form.notes.length}/500</Text>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.canvas },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  list: { paddingHorizontal: 16, paddingVertical: 12 },
  separator: { height: 10 },

  petCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.line,
  },
  petAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  petEmoji: { fontSize: 26 },
  petInfo: { flex: 1 },
  petName: { fontSize: 16, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  petDetail: { fontSize: 13, color: Colors.inkMuted },
  petWeight: { fontSize: 12, color: Colors.inkMuted, marginTop: 2 },
  petActions: { flexDirection: 'row', columnGap: 4 },
  actionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.ink, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: Colors.inkMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: {
    flexDirection: 'row',
    backgroundColor: Colors.sage,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    columnGap: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  modal: { flex: 1, backgroundColor: Colors.canvas },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  modalCancel: { fontSize: 15, color: Colors.inkMuted },
  modalSave: { fontSize: 15, fontWeight: '700', color: Colors.sage },
  modalContent: { padding: 20, paddingBottom: 40 },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.ink,
  },
  textarea: { height: 100, paddingTop: 12 },
  charCount: { fontSize: 11, color: Colors.inkMuted, textAlign: 'right', marginTop: 4 },

  selector: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorText: { fontSize: 15, color: Colors.ink },
  speciesDropdown: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.line,
    marginTop: 4,
    overflow: 'hidden',
  },
  speciesOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  speciesOptionActive: { backgroundColor: Colors.sageFade },
  speciesOptionText: { fontSize: 15, color: Colors.ink },
  speciesOptionTextActive: { color: Colors.sage, fontWeight: '600' },
})
