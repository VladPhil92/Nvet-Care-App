import React, { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import vetService from '../../services/vet.service'
import { qk } from '../../lib/queryKeys'
import { getErrorMessage } from '../../services/api'

const COLORS = {
  gold: '#C9A961',
  sage: '#5B7553',
  bg: '#FAFAF7',
  card: '#FFFFFF',
  text: '#1F2A1B',
  muted: '#5F6B5A',
  border: '#E5E2D8',
  error: '#C53030',
} as const

const COMVEZCOL_FORMAT = /^\d{4,6}-\d$/

export default function VetOnboardingScreen() {
  const queryClient = useQueryClient()
  const [licenseNumber, setLicenseNumber] = useState('')
  const [specialties, setSpecialties] = useState('')
  const [universityName, setUniversityName] = useState('')
  const [graduationYear, setGraduationYear] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationKey: ['vet', 'profile', 'create'],
    mutationFn: () => {
      const normalizedLicense = licenseNumber.trim()
      const year = graduationYear.trim() ? Number(graduationYear) : undefined
      return vetService.createMyProfile({
        licenseNumber: normalizedLicense,
        comvezcolNumber: normalizedLicense,
        specialties: specialties
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        universityName: universityName.trim() || undefined,
        graduationYear: year,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.vets.me.profile() })
      await queryClient.invalidateQueries({ queryKey: qk.vets.me.verification() })
    },
  })

  const submit = () => {
    setValidationError(null)
    const normalizedLicense = licenseNumber.trim()
    if (!COMVEZCOL_FORMAT.test(normalizedLicense)) {
      setValidationError('Ingresa el número COMVEZCOL con formato 12345-6.')
      return
    }

    if (graduationYear.trim()) {
      const year = Number(graduationYear)
      const currentYear = new Date().getFullYear()
      if (!Number.isInteger(year) || year < 1950 || year > currentYear) {
        setValidationError('El año de graduación no es válido.')
        return
      }
    }

    mutation.mutate()
  }

  const errorMessage = validationError || (mutation.isError ? getErrorMessage(mutation.error) : null)

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.badge}>
            <Text style={styles.badgeText}>CUENTA VETERINARIA</Text>
          </View>
          <Text style={styles.title}>Completa tu perfil profesional</Text>
          <Text style={styles.subtitle}>
            Tu rol VET ya está definido. Registra estos datos una sola vez para habilitar el Dashboard Veterinario con agenda, tarifas, ingresos, historias clínicas y chat. Tu perfil seguirá oculto al público hasta aprobar la verificación profesional.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Número COMVEZCOL</Text>
            <TextInput
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="12345-6"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              editable={!mutation.isPending}
              style={styles.input}
              accessibilityLabel="Número COMVEZCOL"
            />

            <Text style={styles.label}>Especialidades</Text>
            <TextInput
              value={specialties}
              onChangeText={setSpecialties}
              placeholder="Medicina general, cirugía, dermatología"
              placeholderTextColor={COLORS.muted}
              editable={!mutation.isPending}
              style={styles.input}
              accessibilityLabel="Especialidades"
            />

            <Text style={styles.label}>Universidad (opcional)</Text>
            <TextInput
              value={universityName}
              onChangeText={setUniversityName}
              placeholder="Universidad"
              placeholderTextColor={COLORS.muted}
              editable={!mutation.isPending}
              style={styles.input}
              accessibilityLabel="Universidad"
            />

            <Text style={styles.label}>Año de graduación (opcional)</Text>
            <TextInput
              value={graduationYear}
              onChangeText={setGraduationYear}
              placeholder="2020"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
              editable={!mutation.isPending}
              style={styles.input}
              accessibilityLabel="Año de graduación"
            />

            {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

            <Pressable
              onPress={submit}
              disabled={mutation.isPending}
              style={({ pressed }) => [
                styles.button,
                mutation.isPending && { opacity: 0.6 },
                pressed && !mutation.isPending && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Habilitar Dashboard Veterinario"
              accessibilityState={{ busy: mutation.isPending }}
            >
              {mutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Habilitar Dashboard Veterinario</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 48 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  badgeText: { color: COLORS.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 27, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  subtitle: { fontSize: 13, color: COLORS.muted, lineHeight: 20, marginBottom: 20 },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 18,
  },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.text, marginBottom: 6, marginTop: 10 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 13,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontSize: 14,
  },
  error: { color: COLORS.error, fontSize: 12, lineHeight: 17, marginTop: 12 },
  button: {
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
})
