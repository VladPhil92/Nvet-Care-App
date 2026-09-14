import React, { useState } from 'react'
import {
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import NvetLogo from '../../components/brand/NvetLogo'
import { qk } from '../../lib/queryKeys'
import { queryClient } from '../../lib/queryClient'
import authService from '../../services/auth.service'
import { Colors, FontSize, Spacing, Typography } from '../../theme/tokens'

const CANONICAL_ADMIN_URL = 'https://ctgone.com/nvetcareapp/dashboard'

/**
 * ADMIN/SUPERADMIN authority is intentionally operated from the canonical web
 * dashboard. Rendering ClientNavigator for these roles exposed CLIENT-only
 * actions backed by endpoints that correctly reject administrative tokens.
 * This handoff screen keeps mobile honest: no fake client authority, no 403
 * maze, and no duplicated administrative control plane.
 */
export default function AdminPortalScreen() {
  const [error, setError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  async function openAdminDashboard() {
    setError(null)
    try {
      await Linking.openURL(CANONICAL_ADMIN_URL)
    } catch {
      setError('No se pudo abrir el dashboard web. Verifica tu conexión e inténtalo nuevamente.')
    }
  }

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    setError(null)
    try {
      await authService.logout()
    } catch {
      // AuthService clears the encrypted local session in `finally`, even when
      // the server cannot be reached. The user must never be trapped in an
      // administrative session because logout networking failed.
    } finally {
      queryClient.setQueryData(qk.auth.me(), null)
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'auth',
      })
      setLoggingOut(false)
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container} testID="admin-web-portal-screen">
        <NvetLogo width={156} height={78} />
        <Text style={styles.eyebrow}>OPERACIÓN ADMINISTRATIVA</Text>
        <Text style={styles.title}>Tu panel completo está en CTG One</Text>
        <Text style={styles.body}>
          ADMIN y SUPERADMIN usan el control plane web canónico para gobernanza,
          usuarios, veterinarios, citas, transacciones, auditoría y Beta Cartagena.
          La app móvil no simula permisos CLIENT ni duplica controles sensibles.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Autoridad preservada</Text>
          <Text style={styles.cardText}>
            Tu sesión conserva el rol administrativo real. Abrir el panel web no
            modifica tu rol ni crea una sesión veterinaria o de cliente.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir dashboard administrativo de Nvet Care"
          onPress={openAdminDashboard}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          testID="open-admin-web-dashboard"
        >
          <Text style={styles.buttonText}>Abrir dashboard administrativo</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión administrativa"
          disabled={loggingOut}
          onPress={logout}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.buttonPressed,
            loggingOut && styles.disabledButton,
          ]}
          testID="admin-logout"
        >
          <Text style={styles.logoutButtonText}>
            {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </Text>
        </Pressable>

        <Text style={styles.url}>ctgone.com/nvetcareapp/dashboard</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.canvas,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.xxxl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyebrow: {
    marginTop: Spacing.lg,
    fontFamily: Typography.sans,
    fontSize: FontSize.tiny,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: Colors.sageText,
  },
  title: {
    marginTop: Spacing.sm,
    maxWidth: 420,
    textAlign: 'center',
    fontFamily: Typography.sans,
    fontSize: FontSize.h1,
    fontWeight: '800',
    color: Colors.ink,
  },
  body: {
    marginTop: Spacing.lg,
    maxWidth: 520,
    textAlign: 'center',
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.inkMuted,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    marginTop: Spacing.xxl,
    padding: Spacing.xl,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  cardTitle: {
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    fontWeight: '800',
    color: Colors.ink,
  },
  cardText: {
    marginTop: Spacing.sm,
    fontFamily: Typography.sans,
    fontSize: FontSize.small,
    lineHeight: 19,
    color: Colors.inkMuted,
  },
  button: {
    width: '100%',
    maxWidth: 520,
    minHeight: 50,
    marginTop: Spacing.xxl,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dark,
  },
  logoutButton: {
    width: '100%',
    maxWidth: 520,
    minHeight: 48,
    marginTop: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.lineHi,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  disabledButton: {
    opacity: 0.55,
  },
  buttonText: {
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    fontWeight: '800',
    color: Colors.inkInv,
  },
  logoutButtonText: {
    fontFamily: Typography.sans,
    fontSize: FontSize.body,
    fontWeight: '800',
    color: Colors.ink,
  },
  url: {
    marginTop: Spacing.md,
    fontFamily: Typography.mono,
    fontSize: FontSize.tiny,
    color: Colors.inkMuted,
  },
  error: {
    marginTop: Spacing.lg,
    maxWidth: 520,
    textAlign: 'center',
    fontFamily: Typography.sans,
    fontSize: FontSize.small,
    color: Colors.err,
  },
})
