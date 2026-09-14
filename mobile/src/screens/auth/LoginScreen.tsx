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

import NvetLogo from '../../components/brand/NvetLogo'
import type { LoginScreenProps } from '../../navigation/types'
import { useLoginMutation } from '../../hooks/queries/useMobileMutations'
import { getErrorMessage } from '../../services/api'
import ctgFederationService from '../../services/ctg-federation.service'
import {
  BorderRadius,
  Colors,
  FontSize,
  Spacing,
  Typography,
} from '../../theme/tokens'

/**
 * LoginScreen — pantalla de acceso production-grade.
 *
 * Correo/contraseña usa el backend canónico de Nvet. "Continuar con CTG One"
 * abre un authorization-code + PKCE flow; ningún bearer token viaja en el
 * deep link y la sesión resultante termina en el mismo Keystore nativo.
 */
export default function LoginScreen({ navigation }: LoginScreenProps) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [ctgSubmitting, setCtgSubmitting] = useState(false)
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
      },
    )
  }, [validate, email, password, loginMutation, t])

  const handleCtgOne = useCallback(async () => {
    setCtgSubmitting(true)
    try {
      await ctgFederationService.start()
    } catch (error) {
      Alert.alert(
        'CTG One',
        error instanceof Error
          ? error.message
          : 'No se pudo iniciar el acceso con CTG One.',
      )
    } finally {
      setCtgSubmitting(false)
    }
  }, [])

  const isSubmitting = loginMutation.isPending
  const busy = isSubmitting || ctgSubmitting

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
          <View style={styles.brandContainer}>
            <NvetLogo width={150} height={75} />
            <Text style={styles.brand}>Nvet Care</Text>
            <Text style={styles.tagline}>Atención veterinaria a domicilio</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>{t('auth.login.title')}</Text>
            <Text style={styles.subheading}>{t('auth.login.subtitle')}</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('auth.login.emailLabel')}</Text>
              <TextInput
                value={email}
                onChangeText={(value) => {
                  setEmail(value)
                  if (fieldErrors.email) {
                    setFieldErrors((previous) => ({ ...previous, email: undefined }))
                  }
                }}
                placeholder="tunombre@ejemplo.com"
                placeholderTextColor={Colors.inkMuted}
                style={[styles.input, fieldErrors.email && styles.inputError]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                editable={!busy}
                accessibilityLabel="Correo electrónico"
                accessibilityHint="Ingresa tu correo registrado"
              />
              {fieldErrors.email && (
                <Text style={styles.errorText}>{fieldErrors.email}</Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('auth.login.passwordLabel')}</Text>
              <View
                style={[
                  styles.input,
                  styles.inputRow,
                  fieldErrors.password && styles.inputError,
                ]}
              >
                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value)
                    if (fieldErrors.password) {
                      setFieldErrors((previous) => ({
                        ...previous,
                        password: undefined,
                      }))
                    }
                  }}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.inkMuted}
                  style={styles.inputBare}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  editable={!busy}
                  accessibilityLabel="Contraseña"
                />
                <Pressable
                  onPress={() => setShowPassword((value) => !value)}
                  hitSlop={12}
                  accessibilityLabel={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.showToggle}>{showPassword ? 'Ocultar' : 'Ver'}</Text>
                </Pressable>
              </View>
              {fieldErrors.password && (
                <Text style={styles.errorText}>{fieldErrors.password}</Text>
              )}
            </View>

            <Pressable
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={8}
              style={styles.forgotPress}
              accessibilityRole="link"
              accessibilityLabel={t('auth.login.forgotPassword')}
            >
              <Text style={styles.forgotText}>{t('auth.login.forgotPassword')}</Text>
            </Pressable>

            <Pressable
              testID="login-submit"
              onPress={handleSubmit}
              disabled={busy}
              style={({ pressed }) => [
                styles.submitBtn,
                busy && styles.submitBtnDisabled,
                pressed && !busy && styles.submitBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('auth.login.submit')}
              accessibilityState={{ disabled: busy, busy: isSubmitting }}
            >
              {isSubmitting ? (
                <ActivityIndicator color={Colors.inkInv} />
              ) : (
                <Text style={styles.submitText}>{t('auth.login.submit')}</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow} accessibilityElementsHidden>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>o</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              testID="ctg-one-login"
              onPress={() => void handleCtgOne()}
              disabled={busy}
              style={({ pressed }) => [
                styles.ctgBtn,
                busy && styles.submitBtnDisabled,
                pressed && !busy && styles.ctgBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Continuar con CTG One"
              accessibilityHint="Abre CTG One para validar tu identidad y volver a Nvet Care"
              accessibilityState={{ disabled: busy, busy: ctgSubmitting }}
            >
              {ctgSubmitting ? (
                <ActivityIndicator color={Colors.dark} />
              ) : (
                <Text style={styles.ctgText}>Continuar con CTG One</Text>
              )}
            </Pressable>

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
  safe: { flex: 1, backgroundColor: Colors.canvas },
  scroll: {
    flexGrow: 1,
    padding: Spacing.xxl,
    justifyContent: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxxl,
  },
  brand: {
    fontFamily: Typography.sans,
    fontSize: FontSize.h1,
    fontWeight: '700',
    color: Colors.dark,
    letterSpacing: 0.2,
    marginTop: -Spacing.sm,
  },
  tagline: {
    fontFamily: Typography.sans,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
    marginTop: Spacing.xs,
  },
  form: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xxl,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  heading: {
    fontFamily: Typography.sans,
    fontSize: FontSize.h2,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  subheading: {
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    color: Colors.inkMuted,
    marginBottom: Spacing.xxl,
  },
  fieldGroup: { marginBottom: Spacing.lg },
  label: {
    fontFamily: Typography.sans,
    fontSize: FontSize.small,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.lineHi,
    backgroundColor: Colors.surfaceAlt,
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    color: Colors.ink,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  inputBare: {
    flex: 1,
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    color: Colors.ink,
    paddingVertical: 12,
  },
  inputError: { borderColor: Colors.err },
  showToggle: {
    fontFamily: Typography.sans,
    color: Colors.sageText,
    fontSize: FontSize.small,
    fontWeight: '700',
    paddingLeft: Spacing.sm,
  },
  errorText: {
    fontFamily: Typography.sans,
    color: Colors.err,
    fontSize: FontSize.small,
    marginTop: Spacing.xs,
  },
  forgotPress: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  forgotText: {
    fontFamily: Typography.sans,
    color: Colors.sageText,
    fontSize: FontSize.small,
    fontWeight: '600',
  },
  submitBtn: {
    minHeight: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnPressed: { backgroundColor: Colors.sageDark },
  submitText: {
    fontFamily: Typography.sans,
    color: Colors.inkInv,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.line },
  dividerText: {
    fontFamily: Typography.sans,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  ctgBtn: {
    minHeight: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.lineHi,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctgBtnPressed: { backgroundColor: Colors.canvas },
  ctgText: {
    fontFamily: Typography.sans,
    color: Colors.dark,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.xl,
  },
  registerText: {
    fontFamily: Typography.sans,
    color: Colors.inkMuted,
    fontSize: FontSize.body,
  },
  registerLink: {
    fontFamily: Typography.sans,
    color: Colors.sageText,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
})
