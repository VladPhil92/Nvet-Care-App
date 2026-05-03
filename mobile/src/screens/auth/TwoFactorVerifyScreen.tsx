/**
 * TwoFactorVerifyScreen — verificar código TOTP durante login.
 *
 * Esta pantalla se muestra cuando el backend retorna `TWO_FACTOR_REQUIRED`
 * tras un login exitoso de password. Recibe `email` y `password` por params
 * (efímero, en memoria) y los reenvía al backend con el código TOTP.
 *
 * El input auto-submitea cuando hay 6 dígitos. También expone un link
 * "Usar código de recuperación" para flujo alternativo.
 */

import React, { useEffect, useRef, useState } from 'react'
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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon } from '../../components/common/Icon'
import authService from '../../services/auth.service.v2'

interface Props {
  navigation: any
  route: { params: { email: string; password: string } }
}

export default function TwoFactorVerifyScreen({ navigation, route }: Props) {
  const { email, password } = route.params
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<TextInput>(null)

  // Auto-submit al alcanzar 6 dígitos
  useEffect(() => {
    if (code.length === 6 && !submitting) {
      handleVerify()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const handleVerify = async () => {
    if (code.length < 6) return
    setSubmitting(true)
    try {
      await authService.login({ email, password, twoFactorCode: code })
      // El RootNavigator detectará el cambio en useCurrentUserQuery y redirigirá
    } catch (error: any) {
      Alert.alert('Código incorrecto', authService.getErrorMessage(error))
      setCode('')
      inputRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  const handleUseRecovery = () => {
    navigation.replace('TwoFactorRecovery', { email, password })
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

        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Icon name="shield" size={32} color={Colors.sage} />
          </View>
          <Text style={styles.title}>Verifica tu identidad</Text>
          <Text style={styles.desc}>
            Ingresa el código de 6 dígitos que muestra tu autenticador.
          </Text>

          <TextInput
            ref={inputRef}
            style={styles.codeInput}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor={Colors.inkMuted}
            maxLength={6}
            autoFocus
            textAlign="center"
            editable={!submitting}
            accessibilityLabel="Código de 6 dígitos del autenticador"
          />

          {submitting && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={Colors.sage} />
              <Text style={styles.loadingText}>Verificando…</Text>
            </View>
          )}

          <Pressable
            onPress={handleUseRecovery}
            style={styles.linkBtn}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>Usar código de recuperación</Text>
          </Pressable>

          <View style={styles.tipBox}>
            <Icon name="check" size={14} color={Colors.sage} />
            <Text style={styles.tipText}>
              ¿No tienes el código? El autenticador genera uno nuevo cada 30 segundos.
            </Text>
          </View>
        </View>
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
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
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
    lineHeight: 20,
  },
  codeInput: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.ink,
    fontFamily: 'monospace',
    letterSpacing: 12,
    paddingVertical: 18,
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
  },
  loadingText: { color: Colors.inkSec, fontSize: 13 },
  linkBtn: { paddingVertical: 12, alignItems: 'center' },
  linkText: { color: Colors.sageText, fontSize: 14, fontWeight: '600' },
  tipBox: {
    flexDirection: 'row',
    columnGap: 8,
    backgroundColor: Colors.greenSoft,
    padding: 12,
    borderRadius: 10,
    alignItems: 'flex-start',
    marginTop: 'auto',
    marginBottom: 24,
  },
  tipText: { flex: 1, fontSize: 12, color: Colors.ink, lineHeight: 16 },
})
