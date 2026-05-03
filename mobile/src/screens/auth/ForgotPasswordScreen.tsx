import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { ForgotPasswordScreenProps } from '../../navigation/types'

const COLORS = {
  sage: '#5B7553',
  bg: '#FAFAF7',
  text: '#1F2A1B',
  muted: '#5F6B5A',
  border: '#E5E2D8',
} as const

export default function ForgotPasswordScreen({
  navigation,
}: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      Alert.alert('Correo inválido', 'Ingresa un correo electrónico válido')
      return
    }
    // TODO: integrar con `POST /auth/forgot-password` cuando esté implementado.
    // El backend genera un token de reset de 1h y envía email con link.
    // Por seguridad, siempre respondemos OK (no revelar si el correo existe).
    setSubmitted(true)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Volver al login"
          >
            <Text style={styles.back}>← Volver</Text>
          </Pressable>

          {submitted ? (
            <View style={styles.successCard} accessibilityLiveRegion="polite">
              <Text style={styles.successIcon}>✉</Text>
              <Text style={styles.heading}>Revisa tu correo</Text>
              <Text style={styles.subheading}>
                Si {email.trim()} está registrado, recibirás un enlace para
                restablecer tu contraseña en los próximos minutos.
              </Text>
              <Pressable
                onPress={() => navigation.navigate('Login')}
                style={styles.submitBtn}
                accessibilityRole="button"
                accessibilityLabel="Volver a iniciar sesión"
              >
                <Text style={styles.submitText}>Volver al inicio</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.heading}>Recupera tu cuenta</Text>
              <Text style={styles.subheading}>
                Ingresa tu correo electrónico y te enviaremos un enlace para
                restablecer tu contraseña.
              </Text>

              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="tunombre@ejemplo.com"
                placeholderTextColor={COLORS.muted}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                accessibilityLabel="Correo electrónico"
              />

              <Pressable
                onPress={handleSubmit}
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Enviar enlace de recuperación"
              >
                <Text style={styles.submitText}>Enviar enlace</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  backBtn: { position: 'absolute', top: 24, left: 24 },
  back: { color: COLORS.sage, fontSize: 14, fontWeight: '600' },
  heading: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  subheading: { fontSize: 14, color: COLORS.muted, marginBottom: 24, lineHeight: 20 },
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
    marginBottom: 24,
  },
  submitBtn: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  successCard: { alignItems: 'center', padding: 24 },
  successIcon: { fontSize: 64, marginBottom: 16, color: COLORS.sage },
})
