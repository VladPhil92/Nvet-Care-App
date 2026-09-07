import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Card, UI_COLORS } from '../../components/ui/primitives'
import {
  useAccountDeletionReadinessQuery,
  useDeleteAccountMutation,
} from '../../hooks/queries/useAccountDeletion'
import authService from '../../services/auth.service'

interface Props {
  navigation: any
}

export default function DeleteAccountScreen({ navigation }: Props) {
  const readinessQuery = useAccountDeletionReadinessQuery()
  const deleteMutation = useDeleteAccountMutation()
  const readiness = readinessQuery.data

  const [confirmation, setConfirmation] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')

  const canSubmit = useMemo(() => {
    if (!readiness?.canDelete) return false
    if (confirmation !== readiness.confirmationPhrase) return false
    if (readiness.reauthMethod === 'PASSWORD' && currentPassword.length === 0) {
      return false
    }
    if (readiness.twoFactorRequired && !/^\d{6,8}$/.test(twoFactorCode)) {
      return false
    }
    return !deleteMutation.isPending
  }, [
    confirmation,
    currentPassword,
    deleteMutation.isPending,
    readiness,
    twoFactorCode,
  ])

  const submitDeletion = () => {
    if (!readiness || !canSubmit) return

    Alert.alert(
      'Eliminar cuenta permanentemente',
      'Esta acción cerrará todas tus sesiones y eliminará tu acceso. Los registros clínicos, financieros o de auditoría que deban conservarse quedarán pseudonimizados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar cuenta',
          style: 'destructive',
          onPress: () =>
            deleteMutation.mutate(
              {
                confirmation: 'ELIMINAR MI CUENTA',
                ...(readiness.reauthMethod === 'PASSWORD'
                  ? { currentPassword }
                  : {}),
                ...(readiness.twoFactorRequired ? { twoFactorCode } : {}),
              },
              {
                onError: (error) => {
                  Alert.alert(
                    'No se pudo eliminar la cuenta',
                    authService.getErrorMessage(error),
                  )
                },
              },
            ),
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Privacidad y cuenta</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Eliminar cuenta</Text>
        <Text style={styles.lead}>
          Nvet Care permite eliminar tu cuenta desde la app. Antes de hacerlo,
          revisamos que no queden citas, pagos, disputas, retiros o saldos abiertos.
        </Text>

        {readinessQuery.isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={UI_COLORS.sage} />
            <Text style={styles.muted}>Revisando el estado de tu cuenta…</Text>
          </View>
        ) : readinessQuery.isError || !readiness ? (
          <Card>
            <Text style={styles.errorTitle}>No pudimos verificar tu cuenta</Text>
            <Text style={styles.muted}>
              Intenta nuevamente antes de iniciar una eliminación.
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => readinessQuery.refetch()}
            >
              <Text style={styles.retryText}>Reintentar</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            {!readiness.canDelete && (
              <Card>
                <Text style={styles.blockedTitle}>Hay asuntos pendientes</Text>
                {readiness.blockers.map((blocker) => (
                  <View key={blocker.code} style={styles.blockerRow}>
                    <Text style={styles.blockerBullet}>•</Text>
                    <Text style={styles.blockerText}>
                      {blocker.message}
                      {blocker.count ? ` (${blocker.count})` : ''}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            <Card>
              <Text style={styles.sectionTitle}>Qué se elimina</Text>
              {readiness.erasedCategories.map((item) => (
                <Text key={item} style={styles.listItem}>• {item}</Text>
              ))}
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Qué puede conservarse</Text>
              {readiness.retainedCategories.map((item) => (
                <Text key={item} style={styles.listItem}>• {item}</Text>
              ))}
            </Card>

            {readiness.canDelete && (
              <Card>
                {readiness.reauthMethod === 'PASSWORD' && (
                  <>
                    <Text style={styles.fieldLabel}>Contraseña actual</Text>
                    <TextInput
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                      placeholder="Confirma tu contraseña"
                      placeholderTextColor={UI_COLORS.muted}
                      style={styles.input}
                    />
                  </>
                )}

                {readiness.twoFactorRequired && (
                  <>
                    <Text style={styles.fieldLabel}>Código de 2FA</Text>
                    <TextInput
                      value={twoFactorCode}
                      onChangeText={setTwoFactorCode}
                      keyboardType="number-pad"
                      maxLength={8}
                      placeholder="123456"
                      placeholderTextColor={UI_COLORS.muted}
                      style={styles.input}
                    />
                  </>
                )}

                <Text style={styles.fieldLabel}>
                  Escribe exactamente: {readiness.confirmationPhrase}
                </Text>
                <TextInput
                  value={confirmation}
                  onChangeText={setConfirmation}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="ELIMINAR MI CUENTA"
                  placeholderTextColor={UI_COLORS.muted}
                  style={styles.input}
                />

                <Pressable
                  onPress={submitDeletion}
                  disabled={!canSubmit}
                  accessibilityRole="button"
                  accessibilityLabel="Eliminar mi cuenta"
                  accessibilityState={{
                    disabled: !canSubmit,
                    busy: deleteMutation.isPending,
                  }}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    !canSubmit && styles.deleteButtonDisabled,
                    pressed && canSubmit && { opacity: 0.86 },
                  ]}
                >
                  {deleteMutation.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteButtonText}>Eliminar mi cuenta</Text>
                  )}
                </Pressable>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.line,
  },
  backButton: { width: 44, height: 40, justifyContent: 'center' },
  backText: { fontSize: 32, color: UI_COLORS.text, lineHeight: 34 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: UI_COLORS.text,
  },
  headerSpacer: { width: 44 },
  content: { padding: 16, paddingBottom: 48, gap: 14 },
  title: { fontSize: 26, fontWeight: '800', color: UI_COLORS.error },
  lead: { fontSize: 14, lineHeight: 21, color: UI_COLORS.muted },
  loadingBox: { alignItems: 'center', padding: 32, gap: 12 },
  muted: { color: UI_COLORS.muted, fontSize: 13, lineHeight: 19 },
  errorTitle: { color: UI_COLORS.error, fontWeight: '800', marginBottom: 6 },
  blockedTitle: { color: UI_COLORS.error, fontWeight: '800', marginBottom: 10 },
  blockerRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  blockerBullet: { color: UI_COLORS.error, fontWeight: '800' },
  blockerText: { flex: 1, color: UI_COLORS.text, fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: UI_COLORS.text, marginBottom: 8 },
  listItem: { color: UI_COLORS.muted, fontSize: 13, lineHeight: 20, marginBottom: 4 },
  fieldLabel: { color: UI_COLORS.text, fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: UI_COLORS.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: UI_COLORS.text,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  deleteButton: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: UI_COLORS.error,
  },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  retryButton: { marginTop: 12, paddingVertical: 10 },
  retryText: { color: UI_COLORS.sage, fontWeight: '800' },
})
