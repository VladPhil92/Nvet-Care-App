/**
 * ActiveSessionsScreen — gestión de dispositivos con sesión activa.
 *
 * Permite al usuario:
 *  - Ver todas sus sesiones activas (deviceLabel, IP, último uso, fecha de creación)
 *  - Revocar una sesión específica (e.g. dispositivo perdido)
 *  - Revocar TODAS las sesiones (logout-all → forzar re-login en todas las apps)
 *
 * Datos vienen de GET /auth/sessions y la revocación de DELETE /auth/sessions/:id
 * o POST /auth/logout-all.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Colors } from '../../theme/colors'
import { Icon, type IconName } from '../../components/common/Icon'
import authService, { type ActiveSession } from '../../services/auth.service.v2'
import { formatRelativeTime } from '../../utils/format'

interface Props {
  navigation: any
}

export default function ActiveSessionsScreen({ navigation }: Props) {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const data = await authService.listSessions()
      setSessions(data)
    } catch (error: any) {
      Alert.alert('Error', authService.getErrorMessage(error))
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      await fetchSessions()
      setLoading(false)
    })()
  }, [fetchSessions])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchSessions()
    setRefreshing(false)
  }, [fetchSessions])

  const handleRevoke = useCallback(
    (session: ActiveSession) => {
      Alert.alert(
        'Cerrar sesión en este dispositivo',
        `Cerraremos la sesión en "${session.deviceLabel ?? 'este dispositivo'}". Tendrás que volver a iniciar sesión allí.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Cerrar sesión',
            style: 'destructive',
            onPress: async () => {
              setRevokingId(session.id)
              try {
                await authService.revokeSession(session.id)
                setSessions((prev) => prev.filter((s) => s.id !== session.id))
              } catch (error: any) {
                Alert.alert('Error', authService.getErrorMessage(error))
              } finally {
                setRevokingId(null)
              }
            },
          },
        ],
      )
    },
    [],
  )

  const handleRevokeAll = useCallback(() => {
    Alert.alert(
      'Cerrar todas las sesiones',
      'Cerraremos la sesión en TODOS tus dispositivos, incluido este. Tendrás que volver a iniciar sesión.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar todas',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.logoutAllDevices()
              // Tras logout-all, RootNavigator detecta el cambio y va a Login
            } catch (error: any) {
              Alert.alert('Error', authService.getErrorMessage(error))
            }
          },
        },
      ],
    )
  }, [])

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.sage} size="large" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Icon name="arrow-back" size={24} color={Colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Sesiones activas</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.sage} />
        }
        ListHeaderComponent={
          <View style={styles.heroBox}>
            <Icon name="shield" size={28} color={Colors.sage} />
            <Text style={styles.heroTitle}>Tus dispositivos</Text>
            <Text style={styles.heroDesc}>
              Estas son las sesiones activas en tu cuenta. Si ves un dispositivo que no
              reconoces, ciérralo inmediatamente.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            onRevoke={() => handleRevoke(item)}
            isRevoking={revokingId === item.id}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon name="shield" size={32} color={Colors.inkMuted} />
            <Text style={styles.emptyText}>No hay sesiones activas</Text>
          </View>
        }
        ListFooterComponent={
          sessions.length > 0 ? (
            <Pressable
              style={styles.revokeAllBtn}
              onPress={handleRevokeAll}
              accessibilityRole="button"
            >
              <Icon name="close" size={18} color="#C53030" />
              <Text style={styles.revokeAllText}>Cerrar todas las sesiones</Text>
            </Pressable>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

function SessionCard({
  session,
  onRevoke,
  isRevoking,
}: {
  session: ActiveSession
  onRevoke: () => void
  isRevoking: boolean
}) {
  const deviceIcon: IconName = inferDeviceIcon(session.userAgent)
  const lastUsedRel = formatRelativeTime(new Date(session.lastUsedAt))

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Icon name={deviceIcon} size={22} color={Colors.sage} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.deviceLabel} numberOfLines={1}>
          {session.deviceLabel ?? 'Dispositivo desconocido'}
        </Text>
        <Text style={styles.metaText} numberOfLines={2}>
          {parseUserAgent(session.userAgent)}
        </Text>
        <View style={styles.metaRow}>
          {session.ipAddress && (
            <View style={styles.metaPill}>
              <Icon name="location" size={11} color={Colors.inkMuted} />
              <Text style={styles.metaPillText}>{session.ipAddress}</Text>
            </View>
          )}
          <View style={styles.metaPill}>
            <Icon name="check" size={11} color={Colors.inkMuted} />
            <Text style={styles.metaPillText}>{lastUsedRel}</Text>
          </View>
        </View>
      </View>
      <Pressable
        onPress={onRevoke}
        disabled={isRevoking}
        style={({ pressed }) => [
          styles.revokeBtn,
          pressed && { opacity: 0.7 },
          isRevoking && { opacity: 0.4 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Cerrar sesión en ${session.deviceLabel ?? 'este dispositivo'}`}
      >
        {isRevoking ? (
          <ActivityIndicator color="#C53030" size="small" />
        ) : (
          <Icon name="close" size={18} color="#C53030" />
        )}
      </Pressable>
    </View>
  )
}

function inferDeviceIcon(userAgent: string | null): IconName {
  if (!userAgent) return 'profile'
  const ua = userAgent.toLowerCase()
  if (ua.includes('iphone') || ua.includes('ios')) return 'profile'
  if (ua.includes('android')) return 'profile'
  if (ua.includes('chrome') || ua.includes('firefox') || ua.includes('safari'))
    return 'services'
  return 'profile'
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Desconocido'
  // Extraer nombre del browser/OS de forma simple
  const browser = ua.includes('Chrome')
    ? 'Chrome'
    : ua.includes('Safari')
      ? 'Safari'
      : ua.includes('Firefox')
        ? 'Firefox'
        : ua.includes('iOS') || ua.includes('iPhone')
          ? 'iOS'
          : ua.includes('Android')
            ? 'Android'
            : 'Aplicación'
  return browser
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },

  listContent: { padding: 20, paddingBottom: 32 },

  heroBox: {
    backgroundColor: Colors.greenSoft,
    padding: 16,
    borderRadius: 14,
    rowGap: 6,
    marginBottom: 16,
  },
  heroTitle: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  heroDesc: { fontSize: 12, color: Colors.inkSec, lineHeight: 16 },

  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    columnGap: 12,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, rowGap: 4 },
  deviceLabel: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  metaText: { fontSize: 12, color: Colors.inkSec },
  metaRow: { flexDirection: 'row', columnGap: 6, flexWrap: 'wrap', marginTop: 2 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    backgroundColor: Colors.canvas,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  metaPillText: { fontSize: 10, color: Colors.inkMuted, fontWeight: '600' },

  revokeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, rowGap: 8 },
  emptyText: { color: Colors.inkSec, fontSize: 14 },

  revokeAllBtn: {
    flexDirection: 'row',
    columnGap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: '#FEE2E2',
    borderRadius: 100,
    marginTop: 16,
  },
  revokeAllText: { color: '#C53030', fontWeight: '700', fontSize: 14 },
})
