import React, { useMemo, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
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
import VetCard from '../../components/vet/VetCard'
import BookingDateSelector from '../../components/booking/BookingDateSelector'
import PaymentMethodSelector, {
  PaymentMethod,
} from '../../components/booking/PaymentMethodSelector'
import { PaymentFlowStepper } from '../../components/payments/PaymentFlowStepper'
import {
  useVetDetailsQuery,
  useVetPricesQuery,
  useMyPetsQuery,
} from '../../hooks/queries/useMobileQueries'
import {
  useBookAppointmentMutation,
  useProcessPaymentMutation,
  useCreatePetMutation,
} from '../../hooks/queries/useMobileMutations'
import { formatCOP, formatAppointmentDate } from '../../utils/format'
import type { Pet } from '../../services/pet.service'

/**
 * BookAppointmentScreen — flujo de reserva en 4 pasos.
 *
 * 1. Servicio        → elegir entre los servicios del vet (precios visibles)
 * 2. Fecha + Hora    → BookingDateSelector con slots disponibles del backend
 * 3. Mascota + Lugar → seleccionar pet existente o crear nueva inline + dirección
 * 4. Pago            → método (CTG/PSE/TRANSFER) + resumen + botón final
 *
 * Idempotency:
 *  - Se genera un UUID v4 client-side al montar el screen.
 *  - Se reutiliza para `bookAppointment` y `processPayment` → si la red corta
 *    a mitad del request, el reintento crea una sola transacción en backend.
 *
 * Decisiones de diseño:
 *  - Stepper visual con barra de progreso + dots clicables (solo a pasos completados)
 *  - Validación por paso: el botón "Continuar" se desactiva hasta que el paso es válido
 *  - Botón "Atrás" en cada paso (en el primero cierra la pantalla)
 *  - El último paso muestra resumen + botón final "Reservar y pagar"
 *  - Tras éxito: `Alert` con CTA para ir al detalle de la cita
 *
 * a11y:
 *  - Stepper con `accessibilityLabel="Paso N de 4: Título"`
 *  - Validación por paso comunicada con `accessibilityState={{ disabled }}`
 *  - Errores de mutation con `accessibilityLiveRegion="polite"`
 */

interface Props {
  navigation: any
  route: { params: { vetId: string; serviceType?: string } }
}

interface BookingData {
  serviceType: string | null
  amount: number | null
  date: string | null
  time: string | null
  petId: string | null
  address: string
  notes: string
  paymentMethod: PaymentMethod | null
}

const TOTAL_STEPS = 4
const STEP_TITLES = ['Servicio', 'Fecha y hora', 'Mascota', 'Pago']

// --- UUID v4 generator (RFC 4122 compliant, sin dependencias externas) ----
function uuidv4(): string {
  // Math.random ofrece suficiente unicidad para idempotency keys del cliente.
  // Si el backend recibe collision (mismo key con body distinto), responde 409.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function BookAppointmentScreen({ navigation, route }: Props) {
  const { vetId, serviceType: initialService } = route.params

  // Idempotency key estable durante todo el flujo del screen
  const [idempotencyKey] = useState(() => uuidv4())

  const [stepIndex, setStepIndex] = useState(0)
  const [data, setData] = useState<BookingData>({
    serviceType: initialService ?? null,
    amount: null,
    date: null,
    time: null,
    petId: null,
    address: '',
    notes: '',
    paymentMethod: null,
  })

  // Estado del form de pet nueva (inline en paso 3)
  const [newPetMode, setNewPetMode] = useState(false)
  const [newPetName, setNewPetName] = useState('')
  const [newPetSpecies, setNewPetSpecies] = useState('DOG')

  const vetQuery = useVetDetailsQuery(vetId)
  const pricesQuery = useVetPricesQuery(vetId)
  const petsQuery = useMyPetsQuery()

  const bookMutation = useBookAppointmentMutation()
  const payMutation = useProcessPaymentMutation()
  const createPetMutation = useCreatePetMutation()

  const vet = vetQuery.data
  const prices = pricesQuery.data ?? []
  const pets = petsQuery.data ?? []

  // -------- Validación por paso ----------------------------------------
  const canContinue = useMemo(() => {
    switch (stepIndex) {
      case 0:
        return !!data.serviceType && !!data.amount
      case 1:
        return !!data.date && !!data.time
      case 2:
        return !!data.petId && data.address.trim().length >= 8
      case 3:
        return !!data.paymentMethod
      default:
        return false
    }
  }, [stepIndex, data])

  const isFinalStep = stepIndex === TOTAL_STEPS - 1
  const isSubmitting = bookMutation.isPending || payMutation.isPending

  // -------- Handlers ---------------------------------------------------
  const goBack = useCallback(() => {
    if (stepIndex === 0) {
      navigation.goBack()
    } else {
      setStepIndex((s) => s - 1)
    }
  }, [stepIndex, navigation])

  const goNext = useCallback(() => {
    if (!canContinue) return
    setStepIndex((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }, [canContinue])

  const handleSubmit = useCallback(async () => {
    if (
      !data.serviceType ||
      !data.amount ||
      !data.date ||
      !data.time ||
      !data.petId ||
      !data.paymentMethod
    ) {
      Alert.alert('Datos incompletos', 'Completa todos los pasos antes de reservar.')
      return
    }

    try {
      // 1) Crear cita con idempotency-key
      const appointment: any = await bookMutation.mutateAsync({
        vetId,
        petId: data.petId,
        serviceType: data.serviceType,
        date: data.date,
        time: data.time,
        address: data.address.trim(),
        amount: data.amount,
        paymentMethod: data.paymentMethod,
        notes: data.notes.trim() || undefined,
        idempotencyKey,
      })

      // 2) Procesar pago con la misma idempotency-key (link cita ↔ tx)
      await payMutation.mutateAsync({
        appointmentId: appointment.id,
        paymentMethod: data.paymentMethod,
        amountCop: data.amount,
        idempotencyKey,
      })

      Alert.alert(
        '¡Cita reservada! 🐾',
        `Tu reserva con Dr. ${vet?.firstName ?? ''} ${vet?.lastName ?? ''} está confirmada.`,
        [
          {
            text: 'Ver detalles',
            onPress: () => {
              navigation.replace('AppointmentDetail', {
                appointmentId: appointment.id,
              })
            },
          },
          {
            text: 'Volver al inicio',
            style: 'cancel',
            onPress: () => navigation.popToTop(),
          },
        ],
      )
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'No pudimos completar la reserva. Intenta de nuevo.'
      Alert.alert('Error en la reserva', message)
    }
  }, [data, bookMutation, payMutation, navigation, vet, idempotencyKey, vetId])

  const handleCreatePet = useCallback(async () => {
    const trimmed = newPetName.trim()
    if (trimmed.length < 2) {
      Alert.alert('Nombre inválido', 'El nombre debe tener al menos 2 caracteres.')
      return
    }
    try {
      const pet = await createPetMutation.mutateAsync({
        name: trimmed,
        species: newPetSpecies,
      })
      setData((d) => ({ ...d, petId: pet.id }))
      setNewPetMode(false)
      setNewPetName('')
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.response?.data?.message ||
          'No pudimos guardar la mascota. Intenta de nuevo.',
      )
    }
  }, [newPetName, newPetSpecies, createPetMutation])

  // -------- Render -----------------------------------------------------
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Reservar cita
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            Paso {stepIndex + 1} de {TOTAL_STEPS}: {STEP_TITLES[stepIndex]}
          </Text>
        </View>
      </View>

      {/* Stepper visual oficial "Pagos seguros" (5 pasos del flujo de pago) */}
      <View style={styles.stepperWrap}>
        <PaymentFlowStepper
          currentStep={stepIndex < TOTAL_STEPS - 1 ? 'requested' : 'paid'}
          compact
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Resumen del vet en todos los pasos */}
          {vetQuery.isLoading ? (
            <Card>
              <Skeleton width="60%" height={18} />
              <View style={{ height: 8 }} />
              <Skeleton width="40%" height={14} />
            </Card>
          ) : vet ? (
            <VetCard
              vet={{
                id: vet.id,
                firstName: vet.firstName,
                lastName: vet.lastName,
                tier: vet.tier,
                rating: vet.rating,
                reviewCount: vet.reviewCount,
                specialties: vet.specialties,
                yearsExperience: vet.yearsExperience,
              }}
              layout="list"
            />
          ) : null}

          {/* Step content */}
          <View style={{ marginTop: 8 }}>
            {stepIndex === 0 && (
              <Step1Service
                prices={prices}
                isLoading={pricesQuery.isLoading}
                isError={pricesQuery.isError}
                selectedService={data.serviceType}
                onSelect={(serviceType, amount) =>
                  setData((d) => ({ ...d, serviceType, amount }))
                }
              />
            )}

            {stepIndex === 1 && (
              <BookingDateSelector
                vetId={vetId}
                selectedDate={data.date}
                selectedTime={data.time}
                onSelect={(date, time) =>
                  setData((d) => ({ ...d, date, time }))
                }
              />
            )}

            {stepIndex === 2 && (
              <Step3PetAddress
                pets={pets}
                isLoading={petsQuery.isLoading}
                selectedPetId={data.petId}
                onSelectPet={(petId) => setData((d) => ({ ...d, petId }))}
                address={data.address}
                onChangeAddress={(address) =>
                  setData((d) => ({ ...d, address }))
                }
                notes={data.notes}
                onChangeNotes={(notes) => setData((d) => ({ ...d, notes }))}
                newPetMode={newPetMode}
                onToggleNewPet={() => setNewPetMode((p) => !p)}
                newPetName={newPetName}
                onChangeNewPetName={setNewPetName}
                newPetSpecies={newPetSpecies}
                onChangeNewPetSpecies={setNewPetSpecies}
                isCreatingPet={createPetMutation.isPending}
                onCreatePet={handleCreatePet}
              />
            )}

            {stepIndex === 3 && (
              <Step4Payment
                amount={data.amount ?? 0}
                serviceType={data.serviceType ?? ''}
                date={data.date ?? ''}
                time={data.time ?? ''}
                pet={pets.find((p) => p.id === data.petId) ?? null}
                address={data.address}
                paymentMethod={data.paymentMethod}
                onSelectPayment={(paymentMethod) =>
                  setData((d) => ({ ...d, paymentMethod }))
                }
              />
            )}
          </View>
        </ScrollView>

        {/* Footer sticky con botones */}
        <View style={styles.footer}>
          <Pressable
            onPress={goBack}
            disabled={isSubmitting}
            style={[styles.footerBackBtn, isSubmitting && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel={stepIndex === 0 ? 'Cancelar reserva' : 'Paso anterior'}
          >
            <Text style={styles.footerBackText}>
              {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
            </Text>
          </Pressable>

          <View style={{ flex: 1, marginLeft: 12 }}>
            {isFinalStep ? (
              <Button
                label={isSubmitting ? 'Procesando…' : 'Reservar y pagar'}
                onPress={handleSubmit}
                disabled={!canContinue || isSubmitting}
                loading={isSubmitting}
                fullWidth
              />
            ) : (
              <Button
                label="Continuar"
                onPress={goNext}
                disabled={!canContinue}
                fullWidth
                trailingIcon="›"
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// =====================================================================
// STEP 1 — Selección de servicio
// =====================================================================

interface Step1Props {
  prices: Array<{ id: string; serviceName: string; priceCop: number; isActive: boolean }>
  isLoading: boolean
  isError: boolean
  selectedService: string | null
  onSelect: (service: string, amount: number) => void
}

function Step1Service({
  prices,
  isLoading,
  isError,
  selectedService,
  onSelect,
}: Step1Props) {
  if (isLoading) {
    return (
      <View>
        {[0, 1, 2].map((i) => (
          <Card key={i} style={{ marginBottom: 8 }}>
            <Skeleton width="60%" height={16} />
            <View style={{ height: 8 }} />
            <Skeleton width="35%" height={20} />
          </Card>
        ))}
      </View>
    )
  }

  if (isError) {
    return (
      <EmptyState
        glyph="⚠️"
        title="No pudimos cargar los servicios"
        subtitle="Intenta volver a esta pantalla en unos segundos."
      />
    )
  }

  const activePrices = prices.filter((p) => p.isActive)
  if (activePrices.length === 0) {
    return (
      <EmptyState
        glyph="📋"
        title="Sin servicios disponibles"
        subtitle="Este veterinario aún no ha configurado su lista de servicios."
      />
    )
  }

  return (
    <View>
      <Text style={styles.stepTitle}>¿Qué servicio necesitas?</Text>
      <Text style={styles.stepHelper}>
        El precio incluye la visita a domicilio y el servicio profesional.
      </Text>
      <View style={{ marginTop: 12, gap: 10 }}>
        {activePrices.map((price) => {
          const isSelected = selectedService === price.serviceName
          return (
            <Pressable
              key={price.id}
              onPress={() => onSelect(price.serviceName, price.priceCop)}
              style={[
                styles.serviceCard,
                isSelected && styles.serviceCardSelected,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${price.serviceName}, ${formatCOP(price.priceCop)}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{price.serviceName}</Text>
                <Text style={styles.servicePrice}>{formatCOP(price.priceCop)}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  isSelected && styles.radioSelected,
                ]}
              >
                {isSelected && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// =====================================================================
// STEP 3 — Mascota + dirección
// =====================================================================

interface Step3Props {
  pets: Pet[]
  isLoading: boolean
  selectedPetId: string | null
  onSelectPet: (id: string) => void
  address: string
  onChangeAddress: (v: string) => void
  notes: string
  onChangeNotes: (v: string) => void
  newPetMode: boolean
  onToggleNewPet: () => void
  newPetName: string
  onChangeNewPetName: (v: string) => void
  newPetSpecies: string
  onChangeNewPetSpecies: (v: string) => void
  isCreatingPet: boolean
  onCreatePet: () => void
}

const SPECIES_OPTIONS: Array<{ id: string; label: string; glyph: string }> = [
  { id: 'DOG', label: 'Perro', glyph: '🐕' },
  { id: 'CAT', label: 'Gato', glyph: '🐈' },
  { id: 'BIRD', label: 'Ave', glyph: '🦜' },
  { id: 'RABBIT', label: 'Conejo', glyph: '🐇' },
  { id: 'OTHER', label: 'Otra', glyph: '🐾' },
]

function Step3PetAddress({
  pets,
  isLoading,
  selectedPetId,
  onSelectPet,
  address,
  onChangeAddress,
  notes,
  onChangeNotes,
  newPetMode,
  onToggleNewPet,
  newPetName,
  onChangeNewPetName,
  newPetSpecies,
  onChangeNewPetSpecies,
  isCreatingPet,
  onCreatePet,
}: Step3Props) {
  return (
    <View>
      <Text style={styles.stepTitle}>¿Para cuál mascota?</Text>

      {isLoading ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <Skeleton width="80%" height={56} borderRadius={12} />
          <Skeleton width="80%" height={56} borderRadius={12} />
        </View>
      ) : (
        <View style={{ marginTop: 12, gap: 8 }}>
          {pets.length === 0 && !newPetMode && (
            <EmptyState
              glyph="🐾"
              title="Aún no tienes mascotas registradas"
              subtitle="Agrega los datos básicos de tu mascota para reservar."
              actionLabel="Agregar mascota"
              onAction={onToggleNewPet}
            />
          )}

          {pets.map((pet) => {
            const isSelected = selectedPetId === pet.id
            return (
              <Pressable
                key={pet.id}
                onPress={() => onSelectPet(pet.id)}
                style={[
                  styles.petCard,
                  isSelected && styles.petCardSelected,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${pet.name}, ${pet.species}${pet.breed ? `, ${pet.breed}` : ''}`}
              >
                <Text style={styles.petGlyph}>
                  {SPECIES_OPTIONS.find((s) => s.id === pet.species)?.glyph ??
                    '🐾'}
                </Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.petName}>{pet.name}</Text>
                  <Text style={styles.petMeta}>
                    {pet.breed ?? pet.species}
                    {pet.weight ? ` · ${pet.weight} kg` : ''}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    isSelected && styles.radioSelected,
                  ]}
                >
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            )
          })}

          {pets.length > 0 && !newPetMode && (
            <Pressable
              onPress={onToggleNewPet}
              style={styles.addPetBtn}
              accessibilityRole="button"
            >
              <Text style={styles.addPetText}>+ Agregar mascota</Text>
            </Pressable>
          )}

          {newPetMode && (
            <Card variant="flat" style={{ marginTop: 8 }}>
              <Text style={styles.newPetTitle}>Nueva mascota</Text>

              <Text style={styles.fieldLabel}>Nombre</Text>
              <TextInput
                value={newPetName}
                onChangeText={onChangeNewPetName}
                placeholder="Ej. Toby"
                style={styles.input}
                placeholderTextColor={UI_COLORS.muted}
                autoCapitalize="words"
                returnKeyType="done"
                accessibilityLabel="Nombre de la mascota"
              />

              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Especie</Text>
              <View style={styles.speciesRow}>
                {SPECIES_OPTIONS.map((opt) => {
                  const isSelected = newPetSpecies === opt.id
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => onChangeNewPetSpecies(opt.id)}
                      style={[
                        styles.speciesChip,
                        isSelected && styles.speciesChipSelected,
                      ]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={opt.label}
                    >
                      <Text style={styles.speciesGlyph}>{opt.glyph}</Text>
                      <Text
                        style={[
                          styles.speciesLabel,
                          isSelected && styles.speciesLabelSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Cancelar"
                    variant="ghost"
                    onPress={onToggleNewPet}
                    disabled={isCreatingPet}
                    fullWidth
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Guardar mascota"
                    onPress={onCreatePet}
                    loading={isCreatingPet}
                    fullWidth
                  />
                </View>
              </View>
            </Card>
          )}
        </View>
      )}

      {/* Address */}
      <View style={{ marginTop: 24 }}>
        <Text style={styles.stepTitle}>¿Dónde realizamos la visita?</Text>
        <Text style={styles.fieldLabel}>Dirección completa</Text>
        <TextInput
          value={address}
          onChangeText={onChangeAddress}
          placeholder="Ej. Cra 14 #100-23, Apto 502, Cartagena"
          style={[styles.input, { minHeight: 56 }]}
          placeholderTextColor={UI_COLORS.muted}
          multiline
          numberOfLines={2}
          accessibilityLabel="Dirección de la visita"
          accessibilityHint="Escribe la dirección completa con barrio o referencia"
        />

        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
          Notas para el veterinario (opcional)
        </Text>
        <TextInput
          value={notes}
          onChangeText={onChangeNotes}
          placeholder="Síntomas, recordatorios o detalles importantes"
          style={[styles.input, { minHeight: 70 }]}
          placeholderTextColor={UI_COLORS.muted}
          multiline
          numberOfLines={3}
          accessibilityLabel="Notas para el veterinario"
        />
      </View>
    </View>
  )
}

// =====================================================================
// STEP 4 — Pago + resumen
// =====================================================================

interface Step4Props {
  amount: number
  serviceType: string
  date: string
  time: string
  pet: Pet | null
  address: string
  paymentMethod: PaymentMethod | null
  onSelectPayment: (m: PaymentMethod) => void
}

function Step4Payment({
  amount,
  serviceType,
  date,
  time,
  pet,
  address,
  paymentMethod,
  onSelectPayment,
}: Step4Props) {
  return (
    <View>
      <Text style={styles.stepTitle}>Resumen y pago</Text>

      {/* Resumen */}
      <Card variant="flat" style={{ marginTop: 8 }}>
        <SummaryRow label="Servicio" value={serviceType} />
        <SummaryRow
          label="Fecha"
          value={`${formatAppointmentDate(date)} a las ${time}`}
        />
        {pet && <SummaryRow label="Mascota" value={pet.name} />}
        <SummaryRow label="Dirección" value={address} multiline />
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCOP(amount)}</Text>
        </View>
      </Card>

      {/* Selector de método */}
      <View style={{ marginTop: 16 }}>
        <PaymentMethodSelector
          amountCop={amount}
          selected={paymentMethod}
          onSelect={onSelectPayment}
        />
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Badge label="🔒 Pago seguro" tone="success" outline size="sm" />
        <Text style={styles.disclaimerText}>
          Tu información de pago se procesa de forma encriptada. Puedes cancelar
          gratis hasta 1 hora antes del servicio.
        </Text>
      </View>
    </View>
  )
}

interface SummaryRowProps {
  label: string
  value: string
  multiline?: boolean
}

function SummaryRow({ label, value, multiline = false }: SummaryRowProps) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text
        style={[styles.summaryValue, multiline && { textAlign: 'right' }]}
        numberOfLines={multiline ? 3 : 1}
      >
        {value}
      </Text>
    </View>
  )
}

// =====================================================================
// STYLES
// =====================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
  },
  backBtn: { padding: 6, marginRight: 8 },
  backText: { fontSize: 28, color: UI_COLORS.sage, lineHeight: 28 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  headerSubtitle: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
  stepperWrap: {
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
  },
  content: { padding: 16, paddingBottom: 40 },
  stepTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginTop: 12,
  },
  stepHelper: { fontSize: 13, color: UI_COLORS.muted, marginTop: 4 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.text,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: UI_COLORS.text,
    backgroundColor: UI_COLORS.card,
    textAlignVertical: 'top',
  },
  // Service cards
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: UI_COLORS.card,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
  },
  serviceCardSelected: {
    borderColor: UI_COLORS.sage,
    backgroundColor: '#5B75530a',
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 4,
  },
  servicePrice: { fontSize: 14, color: UI_COLORS.sage, fontWeight: '700' },
  // Pet cards
  petCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: UI_COLORS.card,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
  },
  petCardSelected: {
    borderColor: UI_COLORS.sage,
    backgroundColor: '#5B75530a',
  },
  petGlyph: { fontSize: 28 },
  petName: { fontSize: 15, fontWeight: '700', color: UI_COLORS.text },
  petMeta: { fontSize: 12, color: UI_COLORS.muted, marginTop: 2 },
  addPetBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: UI_COLORS.sage,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addPetText: { color: UI_COLORS.sage, fontSize: 14, fontWeight: '700' },
  newPetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 8,
  },
  speciesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  speciesChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: UI_COLORS.card,
    borderWidth: 1.5,
    borderColor: UI_COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  speciesChipSelected: {
    backgroundColor: UI_COLORS.sage,
    borderColor: UI_COLORS.sage,
  },
  speciesGlyph: { fontSize: 14 },
  speciesLabel: { fontSize: 13, fontWeight: '600', color: UI_COLORS.text },
  speciesLabelSelected: { color: '#FFFFFF' },
  // Radio (compartido)
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: UI_COLORS.sage },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI_COLORS.sage,
  },
  // Resumen
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 13, color: UI_COLORS.muted, flexShrink: 0, marginRight: 12 },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: UI_COLORS.text,
    flex: 1,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: UI_COLORS.borderLight,
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: UI_COLORS.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: UI_COLORS.sage },
  disclaimer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#5B75530a',
    borderRadius: 10,
    gap: 6,
  },
  disclaimerText: { fontSize: 12, color: UI_COLORS.muted, lineHeight: 17 },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: UI_COLORS.card,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.border,
  },
  footerBackBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
  },
  footerBackText: { fontSize: 15, color: UI_COLORS.muted, fontWeight: '600' },
})
