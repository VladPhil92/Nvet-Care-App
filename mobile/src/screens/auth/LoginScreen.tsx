import React, { useState, useCallback } from 'react'
import { useI18n } from '../../i18n/I18nProvider'
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

import type { LoginScreenProps } from '../../navigation/types'
import { useLoginMutation } from '../../hooks/queries/useMobileMutations'
import { getErrorMessage } from '../../services/api'

/**
 * LoginScreen — pantalla de acceso production-grade.
 *
 * Características:
 *  - Validación client-side antes de submit (UX rápida)
 *  - Server-side validation via mutation (la fuente de verdad)
 *  - `KeyboardAvoidingView` para que el form no quede tapado por el teclado
 *  - `secureTextEntry` con toggle ojo
 *  - `autoComplete` y `textContentType` para que iOS sugiera passwords del Keychain
 *  - `accessibilityLabel` en todos los Pressables
 *  - Indicador de loading inline + botón disabled durante submit
 *  - El RootNavigator detecta auth exitoso vía `useCurrentUserQuery` invalidation
 *    y nos redirige automáticamente al ClientStack o VetStack
 */

const COLORS = {
  sage: '#5B7553',
  gold: '#C9A961',
  bg: '#FAFAF7',
  text: '#1F2A1B',
  muted: '#5F6B5A',
  border: '#E5E2D8',
  error: '#C53030',
  inputBg: '#FFFFFF',
} as const

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
    password?: string
  }>({})

  const loginMutation = useLoginMutation()

  const validate = useCallback((): boolean => {
    const errors: typeof fieldErrors = {}
    if (!email.trim()) {
      errors.email = 'El correo es obligatorio'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Correo electrónico inválido'
    }
    if (!password) {
      errors.password = 'La contraseña es obligatoria'
    } else if (password.length < 8) {
      errors.password = 'Mínimo 8 caracteres'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }, [email, password])

  const handleSubmit = useCallback(() => {
    if (!validate()) return
    loginMutation.mutate(
      { email: email.trim(), password },
      {
        onError: (error) => {
          Alert.alert(t('auth.login.errorInvalid'), getErrorMessage(error))
        },
        // En éxito, RootNavigator detecta el cambio en useCurrentUserQuery
        // y redirige automáticamente; no necesitamos navegar explícitamente.
      },
    )
  }, [validate, email, password, loginMutation, t])

  const isSubmitting = loginMutation.isPending

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand */}
          <View style={styles.brandContainer}>
            <View style={styles.brandMark} accessibilityElementsHidden>
              <Text style={styles.brandMarkText}>N</Text>
            </View>
            <Text style={styles.brand}>Nvet Care</Text>
            <Text style={styles.tagline}>Atención veterinaria a domicilio</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.heading}>{t('auth.login.title')}</Text>
            <Text style={styles.subheading}>
              {t('auth.login.subtitle')}
            </Text>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('auth.login.emailLabel')}</Text>
              <TextInput
                value={email}
                onChangeText={(t) => {
                  setEmail(t)
                  if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }))
                }}
                placeholder="tunombre@ejemplo.com"
                placeholderTextColor={COLORS.muted}
                style={[styles.input, fieldErrors.email && styles.inputError]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                editable={!isSubmitting}
                accessibilityLabel="Correo electrónico"
                accessibilityHint="Ingresa tu correo registrado"
              />
              {fieldErrors.email && (
                <Text style={styles.errorText}>{fieldErrors.email}</Text>
              )}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('auth.login.passwordLabel')}</Text>
              <View style={[styles.input, styles.inputRow, fieldErrors.password && styles.inputError]}>
                <TextInput
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t)
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }))
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.muted}
                  style={styles.inputBare}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  editable={!isSubmitting}
                  accessibilityLabel="Contraseña"
                />
                <Pressable
                  onPress={() => setShowPassword((s) => !s)}
                  hitSlop={12}
                  accessibilityLabel={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.showToggle}>
                    {showPassword ? '🙈' : '👁'}
                  </Text>
                </Pressable>
              </View>
              {fieldErrors.password && (
                <Text style={styles.errorText}>{fieldErrors.password}</Text>
              )}
            </View>

            {/* Forgot password */}
            <Pressable
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={8}
              style={styles.forgotPress}
              accessibilityRole="link"
              accessibilityLabel={t('auth.login.forgotPassword')}
            >
              <Text style={styles.forgotText}>{t('auth.login.forgotPassword')}</Text>
            </Pressable>

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.submitBtn,
                isSubmitting && styles.submitBtnDisabled,
                pressed && !isSubmitting && styles.submitBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('auth.login.submit')}
              accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>{t('auth.login.submit')}</Text>
              )}
            </Pressable>

            {/* Register link */}
            <View style={styles.registerRow}>
              <Text style={styles.registerText}>{t('auth.login.noAccount')}</Text>
              <Pressable
                onPress={() => navigation.navigate('Register')}
                hitSlop={8}
                accessibilityRole="link"
                accessibilityLabel={t('auth.login.registerLink')}
              >
                <Text style={styles.registerLink}>{t('auth.login.registerLink')}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.bg },
  scroll: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  brandMark: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  brand: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.sage,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 4,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  heading: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 24,
  },
  fieldGroup: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.inputBg,
    fontSize: 15,
    color: COLORS.text,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  inputBare: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    paddingVertical: 12,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  showToggle: {
    fontSize: 18,
    paddingLeft: 8,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 4,
  },
  forgotPress: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginBottom: 20,
  },
  forgotText: {
    color: COLORS.sage,
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnPressed: {
    opacity: 0.85,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  registerText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  registerLink: {
    color: COLORS.sage,
    fontSize: 14,
    fontWeight: '600',
  },
})
