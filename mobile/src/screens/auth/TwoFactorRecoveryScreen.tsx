import React, { useRef, useState } from 'react'
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
  route: { params: { email: string; password: string } }
}

export default function TwoFactorRecoveryScreen({ navigation, route }: Props) {
  const { email, password } = route.params
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<TextInput>(null)

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase().replace(/\s+/g, '')
    if (!trimmed) {
      Alert.alert('Código requerido', 'Ingresa el código de recuperación.')
      return
    }
    setSubmitting(true)
    try {
      await authService.loginWithRecoveryCode({ email, password, recoveryCode: trimmed })
      // RootNavigator detectará el nuevo user y redirigirá automáticamente
    } catch (error: any) {
      Alert.alert(
        'Código inválido',
        authService.getErrorMessage(error) ||
          'El código de recuperación no es correcto o ya fue usado.',
      )
      setCode('')
      inputRef.current?.focus()
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
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconCircle}>
            <Icon name="shield" size={32} color={Colors.sage} />
          </View>

          <Text style={styles.title}>Código de recuperación</Text>
          <Text style={styles.desc}>
            Ingresa uno de los códigos de recuperación que guardaste cuando activaste el
            autenticador. Cada código solo puede usarse una vez.
          </Text>

          <TextInput
            ref={inputRef}
            style={styles.codeInput}
            value={code}
            onChangeText={setCode}
            placeholder="XXXX-XXXX"
            placeholderTextColor={Colors.inkMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            editable={!submitting}
            accessibilityLabel="Código de recuperación"
          />

          {submitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.sage} />
              <Text style={styles.loadingText}>Verificando…</Text>
            </View>
          ) : (
            <Pressable
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
            >
              <Text style={styles.submitText}>Iniciar sesión</Text>
            </Pressable>
          )}

          <View style={styles.tipBox}>
            <Icon name="check" size={14} color={Colors.sage} />
            <Text style={styles.tipText}>
              Después de usar este código quedarás autenticado, pero te recomendamos
              generar nuevos códigos de recuperación en Configuración → Seguridad →
              Autenticación en dos pasos.
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    rowGap: 18,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.greenSoft,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
  },
  desc: {
    fontSize: 14,
    color: Colors.inkSec,
    textAlign: 'center',
    lineHeight: 21,
  },
  codeInput: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.ink,
    fontFamily: 'monospace',
    letterSpacing: 4,
    paddingVertical: 16,
    paddingHorizontal: 20,
    textAlign: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.line,
    marginTop: 8,
  },
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
  },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  tipBox: {
    flexDirection: 'row',
    columnGap: 8,
    backgroundColor: Colors.greenSoft,
    padding: 14,
    borderRadius: 10,
    alignItems: 'flex-start',
    marginTop: 8,
  },
  tipText: { flex: 1, fontSize: 12, color: Colors.ink, lineHeight: 17 },
})
