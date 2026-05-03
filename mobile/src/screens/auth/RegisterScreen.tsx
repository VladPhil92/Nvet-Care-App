import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { RegisterScreenProps } from '../../navigation/types'
import authService from '../../services/auth.service'
import { qk } from '../../lib/queryKeys'
import { getErrorMessage } from '../../services/api'

const COLORS = {
  sage: '#5B7553',
  gold: '#C9A961',
  bg: '#FAFAF7',
  text: '#1F2A1B',
  muted: '#5F6B5A',
  border: '#E5E2D8',
  error: '#C53030',
} as const

type Role = 'CLIENT' | 'VET'

export default function RegisterScreen({ navigation, route }: RegisterScreenProps) {
  const initialRole: Role = route.params?.role ?? 'CLIENT'
  const qc = useQueryClient()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(initialRole)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationKey: ['auth', 'register'],
    mutationFn: () =>
      authService.register({
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        role,
      }),
    onSuccess: (data) => {
      qc.setQueryData(qk.auth.me(), data.user)
      qc.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] !== 'auth',
      })
    },
    onError: (err) => {
      Alert.alert('No pudimos registrarte', getErrorMessage(err))
    },
  })

  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {}
    if (firstName.trim().length < 2) e.firstName = 'Ingresa tu nombre'
    if (lastName.trim().length < 2) e.lastName = 'Ingresa tu apellido'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      e.email = 'Correo inválido'
    if (password.length < 8) e.password = 'Mínimo 8 caracteres'
    if (phone && !/^\+?[\d\s-]{7,15}$/.test(phone)) e.phone = 'Teléfono inválido'
    setErrors(e)
    return Object.keys(e).length === 0
  }, [firstName, lastName, email, password, phone])

  const handleSubmit = () => {
    if (!validate()) return
    mutation.mutate()
  }

  const isSubmitting = mutation.isPending

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Text style={styles.backText}>← Volver</Text>
          </Pressable>

          <Text style={styles.heading}>Crear cuenta</Text>
          <Text style={styles.subheading}>
            Únete a la plataforma de cuidado veterinario a domicilio
          </Text>

          {/* Role selector */}
          <View style={styles.roleRow}>
            {(['CLIENT', 'VET'] as Role[]).map((r) => (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={[
                  styles.roleBtn,
                  role === r && {
                    backgroundColor: r === 'VET' ? COLORS.gold : COLORS.sage,
                    borderColor: r === 'VET' ? COLORS.gold : COLORS.sage,
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: role === r }}
                accessibilityLabel={
                  r === 'CLIENT' ? 'Soy cliente' : 'Soy veterinario'
                }
              >
                <Text
                  style={[
                    styles.roleBtnText,
                    role === r && styles.roleBtnTextActive,
                  ]}
                >
                  {r === 'CLIENT' ? '🐾  Soy cliente' : '⚕️  Soy veterinario'}
                </Text>
              </Pressable>
            ))}
          </View>

          {role === 'VET' && (
            <View style={styles.vetNotice}>
              <Text style={styles.vetNoticeText}>
                Como veterinario deberás completar la verificación profesional
                (Tarjeta COMVEZCOL, título y documento de identidad) antes de
                poder ofrecer servicios.
              </Text>
            </View>
          )}

          {/* Name */}
          <View style={styles.row}>
            <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Nombre</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Juan"
                placeholderTextColor={COLORS.muted}
                style={[styles.input, errors.firstName && styles.inputError]}
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                editable={!isSubmitting}
                accessibilityLabel="Nombre"
              />
              {errors.firstName && <Text style={styles.error}>{errors.firstName}</Text>}
            </View>
            <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Apellido</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Pérez"
                placeholderTextColor={COLORS.muted}
                style={[styles.input, errors.lastName && styles.inputError]}
                autoCapitalize="words"
                autoComplete="family-name"
                textContentType="familyName"
                editable={!isSubmitting}
                accessibilityLabel="Apellido"
              />
              {errors.lastName && <Text style={styles.error}>{errors.lastName}</Text>}
            </View>
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="tunombre@ejemplo.com"
              placeholderTextColor={COLORS.muted}
              style={[styles.input, errors.email && styles.inputError]}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!isSubmitting}
              accessibilityLabel="Correo electrónico"
            />
            {errors.email && <Text style={styles.error}>{errors.email}</Text>}
          </View>

          {/* Phone */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Teléfono (opcional)</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+57 300 123 4567"
              placeholderTextColor={COLORS.muted}
              style={[styles.input, errors.phone && styles.inputError]}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              editable={!isSubmitting}
              accessibilityLabel="Número de teléfono"
            />
            {errors.phone && <Text style={styles.error}>{errors.phone}</Text>}
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={COLORS.muted}
              style={[styles.input, errors.password && styles.inputError]}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              editable={!isSubmitting}
              accessibilityLabel="Crear contraseña"
            />
            {errors.password && <Text style={styles.error}>{errors.password}</Text>}
          </View>

          <Text style={styles.terms}>
            Al registrarte aceptas nuestros Términos y Política de Privacidad.
          </Text>

          <Pressable
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.submitBtn,
              { backgroundColor: role === 'VET' ? COLORS.gold : COLORS.sage },
              isSubmitting && { opacity: 0.6 },
              pressed && !isSubmitting && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Crear cuenta"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Crear cuenta</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 24, paddingBottom: 48 },
  backBtn: { paddingVertical: 4, marginBottom: 12 },
  backText: { color: COLORS.sage, fontSize: 14, fontWeight: '600' },
  heading: { fontSize: 26, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subheading: { fontSize: 14, color: COLORS.muted, marginBottom: 24 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  roleBtn: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  roleBtnTextActive: { color: '#fff' },
  vetNotice: {
    backgroundColor: `${COLORS.gold}1a`,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  vetNoticeText: { fontSize: 12, color: COLORS.text, lineHeight: 18 },
  row: { flexDirection: 'row' },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
    fontSize: 15,
    color: COLORS.text,
  },
  inputError: { borderColor: COLORS.error },
  error: { color: COLORS.error, fontSize: 12, marginTop: 4 },
  terms: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginVertical: 16 },
  submitBtn: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
