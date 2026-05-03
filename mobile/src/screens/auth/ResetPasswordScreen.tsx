/**
 * ResetPasswordScreen — completar reset con token recibido por email.
 *
 * Recibe `token` via:
 *   - Deep link `nvetcare://reset-password?token=<userId>.<rawToken>`
 *   - Universal link `https://app.nvetcare.co/reset-password?token=...`
 *
 * Validaciones:
 *   - Password mínimo 12 chars con regex de fortaleza (mismo del backend)
 *   - Medidor visual: débil/aceptable/fuerte
 *   - Confirmación que debe coincidir
 *
 * Tras éxito: muestra success screen + redirige a Login tras 2s.
 */

import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon } from '../../components/common/Icon'
import authService from '../../services/auth.service.v2'

interface Props {
  navigation: any
  route: { params: { token: string } }
}

const STRONG_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]).{12,128}$/

interface ChecklistItem {
  label: string
  test: (pwd: string) => boolean
}

const CHECKLIST: ChecklistItem[] = [
  { label: 'Mínimo 12 caracteres', test: (p) => p.length >= 12 },
  { label: 'Una letra mayúscula', test: (p) => /[A-Z]/.test(p) },
  { label: 'Una letra minúscula', test: (p) => /[a-z]/.test(p) },
  { label: 'Un número', test: (p) => /\d/.test(p) },
  {
    label: 'Un símbolo especial',
    test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(p),
  },
]

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const { token } = route.params
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const passingChecks = useMemo(
    () => CHECKLIST.filter((c) => c.test(password)).length,
    [password],
  )
  const isValid = STRONG_REGEX.test(password)
  const matches = password.length > 0 && password === confirm

  // Strength visual: 0..5
  const strengthLabel =
    passingChecks <= 2 ? 'Débil' : passingChecks <= 4 ? 'Aceptable' : 'Fuerte'
  const strengthColor =
    passingChecks <= 2 ? '#C53030' : passingChecks <= 4 ? Colors.gold : Colors.sage

  const handleSubmit = async () => {
    if (!isValid) {
      Alert.alert('Contraseña inválida', 'Revisa los requisitos de la lista.')
      return
    }
    if (!matches) {
      Alert.alert('Confirmación', 'Las contraseñas no coinciden.')
      return
    }
    setSubmitting(true)
    try {
      await authService.resetPassword(token, password)
      setSuccess(true)
      setTimeout(() => navigation.replace('Login'), 2000)
    } catch (error: any) {
      Alert.alert('Error', authService.getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Icon name="check" size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.successTitle}>Contraseña actualizada</Text>
          <Text style={styles.successDesc}>
            Te llevaremos a iniciar sesión con tu nueva contraseña…
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Icon name="arrow-back" size={24} color={Colors.ink} />
          </Pressable>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconCircle}>
            <Icon name="lock" size={32} color={Colors.sage} />
          </View>
          <Text style={styles.title}>Nueva contraseña</Text>
          <Text style={styles.desc}>
            Crea una contraseña fuerte y única que solo uses en Nvet Care.
          </Text>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nueva contraseña</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                style={styles.inputBare}
                placeholder="••••••••••••"
                placeholderTextColor={Colors.inkMuted}
                secureTextEntry={!showPwd}
                autoCapitalize="none"
                autoComplete="password-new"
                accessibilityLabel="Nueva contraseña"
              />
              <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={12}>
                <Icon name={showPwd ? 'close' : 'check'} size={18} color={Colors.inkMuted} />
              </Pressable>
            </View>
          </View>

          {/* Strength meter */}
          {password.length > 0 && (
            <View style={styles.strengthWrap}>
              <View style={styles.strengthBar}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.strengthSeg,
                      { backgroundColor: i < passingChecks ? strengthColor : Colors.line },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.strengthLabel, { color: strengthColor }]}>
                {strengthLabel}
              </Text>
            </View>
          )}

          {/* Checklist */}
          <View style={styles.checklist}>
            {CHECKLIST.map((c) => {
              const ok = c.test(password)
              return (
                <View key={c.label} style={styles.checkRow}>
                  <View style={[styles.checkDot, ok && styles.checkDotOk]}>
                    {ok && <Icon name="check" size={10} color="#FFFFFF" />}
                  </View>
                  <Text style={[styles.checkText, ok && styles.checkTextOk]}>
                    {c.label}
                  </Text>
                </View>
              )
            })}
          </View>

          {/* Confirm */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirma tu contraseña</Text>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              style={styles.input}
              placeholder="Repite la contraseña"
              placeholderTextColor={Colors.inkMuted}
              secureTextEntry={!showPwd}
              autoCapitalize="none"
              autoComplete="password-new"
              accessibilityLabel="Confirmar contraseña"
            />
            {confirm.length > 0 && !matches && (
              <Text style={styles.errorText}>Las contraseñas no coinciden</Text>
            )}
          </View>

          <Pressable
            style={[
              styles.cta,
              (!isValid || !matches || submitting) && styles.ctaDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!isValid || !matches || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.ctaText}>Actualizar contraseña</Text>
                <Icon name="check" size={18} color="#FFFFFF" />
              </>
            )}
          </Pressable>

          <View style={styles.tipBox}>
            <Icon name="shield" size={14} color={Colors.sage} />
            <Text style={styles.tipText}>
              Tras actualizar, todas las sesiones activas se cerrarán por seguridad.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  content: { padding: 24, paddingBottom: 40, rowGap: 14 },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.greenSoft,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  desc: { fontSize: 14, color: Colors.inkSec, textAlign: 'center', lineHeight: 20 },

  fieldGroup: { rowGap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    fontSize: 15,
    color: Colors.ink,
  },
  inputRow: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputBare: {
    flex: 1,
    fontSize: 15,
    color: Colors.ink,
    paddingVertical: 12,
  },
  errorText: { fontSize: 12, color: '#C53030', fontWeight: '600' },

  strengthWrap: { flexDirection: 'row', alignItems: 'center', columnGap: 10 },
  strengthBar: { flex: 1, flexDirection: 'row', columnGap: 4 },
  strengthSeg: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '700', minWidth: 70 },

  checklist: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    rowGap: 6,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  checkDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDotOk: { backgroundColor: Colors.sage, borderColor: Colors.sage },
  checkText: { fontSize: 13, color: Colors.inkSec },
  checkTextOk: { color: Colors.ink, fontWeight: '600' },

  cta: {
    flexDirection: 'row',
    backgroundColor: Colors.sage,
    paddingVertical: 14,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    marginTop: 8,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  tipBox: {
    flexDirection: 'row',
    columnGap: 8,
    backgroundColor: Colors.greenSoft,
    padding: 12,
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  tipText: { flex: 1, fontSize: 12, color: Colors.ink, lineHeight: 16 },

  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    rowGap: 16,
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 14,
    color: Colors.inkSec,
    textAlign: 'center',
    lineHeight: 20,
  },
})
