import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import NvetLogo from '../../components/brand/NvetLogo'
import type { CtgFederationCallbackScreenProps } from '../../navigation/types'
import { qk } from '../../lib/queryKeys'
import { queryClient } from '../../lib/queryClient'
import ctgFederationService, {
  CtgFederationError,
  type PendingCtgFederationExchange,
} from '../../services/ctg-federation.service'
import { BorderRadius, Colors, FontSize, Spacing, Typography } from '../../theme/tokens'

export default function CtgFederationCallbackScreen({
  route,
  navigation,
}: CtgFederationCallbackScreenProps) {
  const pendingRef = useRef<PendingCtgFederationExchange | null>(null)
  const startedRef = useRef(false)
  const [status, setStatus] = useState<'working' | 'two-factor' | 'error'>('working')
  const [message, setMessage] = useState('Validando tu cuenta CTG One…')
  const [twoFactorCode, setTwoFactorCode] = useState('')

  const establishSession = useCallback(
    async (pending: PendingCtgFederationExchange, code?: string) => {
      setStatus('working')
      setMessage('Creando tu sesión segura en Nvet Care…')
      try {
        const session = await ctgFederationService.exchange(pending, code)
        queryClient.setQueryData(qk.auth.me(), session.user)
      } catch (error) {
        if (error instanceof CtgFederationError && error.code === 'TWO_FACTOR_REQUIRED') {
          pendingRef.current = pending
          setStatus('two-factor')
          setMessage('Tu cuenta Nvet requiere el código del autenticador.')
          return
        }
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'No se pudo completar el acceso con CTG One.')
      }
    },
    [],
  )

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    void (async () => {
      try {
        const pending = await ctgFederationService.consumeCallback(
          route.params.code,
          route.params.state,
        )
        pendingRef.current = pending
        await establishSession(pending)
      } catch (error) {
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'No se pudo validar la respuesta de CTG One.')
      }
    })()
  }, [establishSession, route.params.code, route.params.state])

  const submitTwoFactor = useCallback(() => {
    const pending = pendingRef.current
    if (!pending || !twoFactorCode.trim()) return
    void establishSession(pending, twoFactorCode)
  }, [establishSession, twoFactorCode])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <NvetLogo width={150} height={75} />
        <Text style={styles.title}>Nvet Care + CTG One</Text>
        <Text style={styles.message}>{message}</Text>

        {status === 'working' && <ActivityIndicator size="large" color={Colors.sage} />}

        {status === 'two-factor' && (
          <View style={styles.form}>
            <TextInput
              value={twoFactorCode}
              onChangeText={setTwoFactorCode}
              placeholder="Código de 6 dígitos"
              placeholderTextColor={Colors.inkMuted}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              style={styles.input}
              accessibilityLabel="Código del autenticador"
            />
            <Pressable
              onPress={submitTwoFactor}
              disabled={!twoFactorCode.trim()}
              style={({ pressed }) => [
                styles.primary,
                !twoFactorCode.trim() && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryText}>Confirmar</Text>
            </Pressable>
          </View>
        )}

        {status === 'error' && (
          <Pressable style={styles.secondary} onPress={() => navigation.replace('Login')}>
            <Text style={styles.secondaryText}>Volver a iniciar sesión</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
  },
  title: {
    fontFamily: Typography.sans,
    fontSize: FontSize.h2,
    fontWeight: '700',
    color: Colors.ink,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  message: {
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    color: Colors.inkMuted,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  form: { width: '100%', maxWidth: 420, gap: Spacing.md },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.lineHi,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    color: Colors.ink,
    paddingHorizontal: Spacing.lg,
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
  },
  primary: {
    minHeight: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: Colors.inkInv,
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    fontWeight: '700',
  },
  secondary: {
    minHeight: 48,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.lineHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: Colors.ink,
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    fontWeight: '600',
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
})
