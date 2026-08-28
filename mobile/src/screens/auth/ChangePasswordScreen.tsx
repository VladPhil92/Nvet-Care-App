import React, { useState } from 'react'
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
}

function strengthScore(password: string): number {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score
}

const STRENGTH_LABELS = ['', 'Muy débil', 'Débil', 'Regular', 'Fuerte', 'Muy fuerte']
const STRENGTH_COLORS = ['', '#C53030', '#DD6B20', '#D69B2D', '#5B7553', '#2F855A']

export default function ChangePasswordScreen({ navigation }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const score = strengthScore(next)
  const passwordsMatch = next === confirm
  const canSubmit =
    current.trim().length > 0 && next.length >= 8 && passwordsMatch && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return

    if (next.length < 8) {
      Alert.alert('Contraseña muy corta', 'La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (!passwordsMatch) {
      Alert.alert('Contraseñas diferentes', 'La nueva contraseña y su confirmación no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      await authService.changePassword(current, next)
      Alert.alert(
        'Contraseña actualizada',
        'Tu contraseña ha sido cambiada. Por seguridad, se cerrará tu sesión.',
        [{ text: 'Entendido', onPress: () => navigation.goBack() }],
      )
    } catch (error: any) {
      Alert.alert(
        'No se pudo cambiar',
        authService.getErrorMessage(error) || 'Verifica tu contraseña actual e intenta de nuevo.',
      )
    } finally {
      setSubmitting(false)
    }
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
          <Text style={styles.headerTitle}>Cambiar contraseña</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Current password */}
          <View style={styles.field}>
            <Text style={styles.label}>Contraseña actual</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={current}
                onChangeText={setCurrent}
                secureTextEntry={!showCurrent}
                placeholder="Contraseña actual"
                placeholderTextColor={Colors.inkMuted}
                autoComplete="current-password"
                returnKeyType="next"
                editable={!submitting}
                accessibilityLabel="Contraseña actual"
              />
              <Pressable
                onPress={() => setShowCurrent((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={showCurrent ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Text style={styles.eyeToggle}>{showCurrent ? '🙈' : '👁'}</Text>
              </Pressable>
            </View>
          </View>

          {/* New password */}
          <View style={styles.field}>
            <Text style={styles.label}>Nueva contraseña</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={next}
                onChangeText={setNext}
                secureTextEntry={!showNext}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={Colors.inkMuted}
                autoComplete="new-password"
                returnKeyType="next"
                editable={!submitting}
                accessibilityLabel="Nueva contraseña"
              />
              <Pressable
                onPress={() => setShowNext((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={showNext ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Text style={styles.eyeToggle}>{showNext ? '🙈' : '👁'}</Text>
              </Pressable>
            </View>

            {/* Strength bar */}
            {next.length > 0 && (
              <View style={styles.strengthWrap}>
                <View style={styles.strengthBar}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthSegment,
                        {
                          backgroundColor:
                            i <= score ? STRENGTH_COLORS[score] : Colors.line,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: STRENGTH_COLORS[score] }]}>
                  {STRENGTH_LABELS[score]}
                </Text>
              </View>
            )}
          </View>

          {/* Confirm password */}
          <View style={styles.field}>
            <Text style={styles.label}>Confirmar nueva contraseña</Text>
            <View style={
              [styles.inputWrap,
                confirm.length > 0 && !passwordsMatch && styles.inputError,
              ]
            }>
              <TextInput
                style={styles.input}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                placeholder="Repite la nueva contraseña"
                placeholderTextColor={Colors.inkMuted}
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                editable={!submitting}
                accessibilityLabel="Confirmar nueva contraseña"
              />
            </View>
            {confirm.length > 0 && !passwordsMatch && (
              <Text style={styles.errorText}>Las contraseñas no coinciden</Text>
            )}
          </View>

          {/* Password requirements */}
          <View style={styles.reqBox}>
            <Req met={next.length >= 8} text="Al menos 8 caracteres" />
            <Req met={/[A-Z]/.test(next)} text="Una mayúscula" />
            <Req met={/[0-9]/.test(next)} text="Un número" />
            <Req met={/[^A-Za-z0-9]/.test(next)} text="Un carácter especial" />
          </View>

          {submitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.sage} />
              <Text style={styles.loadingText}>Actualizando contraseña…</Text>
            </View>
          ) : (
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                !canSubmit && styles.submitDisabled,
                pressed && canSubmit && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Cambiar contraseña"
            >
              <Text style={styles.submitText}>Cambiar contraseña</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Req({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.reqRow}>
      <Text style={{ fontSize: 12 }}>{met ? '✅' : '⬜'}</Text>
      <Text style={[styles.reqText, { color: met ? Colors.sage : Colors.inkMuted }]}>
        {text}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  content: { padding: 20, rowGap: 20, paddingBottom: 40 },
  field: { rowGap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.line,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  inputError: { borderColor: '#C53030' },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.ink,
    paddingVertical: 12,
  },
  errorText: { fontSize: 12, color: '#C53030', marginTop: 2 },
  strengthWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    marginTop: 6,
  },
  strengthBar: { flex: 1, flexDirection: 'row', columnGap: 4 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '600', width: 70, textAlign: 'right' },
  reqBox: { rowGap: 6 },
  reqRow: { flexDirection: 'row', alignItems: 'center', columnGap: 8 },
  reqText: { fontSize: 12 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    paddingVertical: 16,
  },
  loadingText: { color: Colors.inkSec, fontSize: 13 },
  submitBtn: {
    backgroundColor: Colors.sage,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  eyeToggle: { fontSize: 18, paddingHorizontal: 4 },
})
