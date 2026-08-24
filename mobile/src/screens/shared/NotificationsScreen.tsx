import React, { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  Button,
  Badge,
  EmptyState,
  UI_COLORS,
} from '../../components/ui/primitives'
import { formatRelativeTime } from '../../utils/format'

interface Props {
  navigation: any
}

type NotifType = 'APPOINTMENT' | 'PAYMENT' | 'SYSTEM' | 'REVIEW'
type PermissionStatus = 'granted' | 'denied' | 'undetermined'

interface Notification {
  id: string
  type: NotifType
  title: string
  body: string
  timestamp: string
  read: boolean
  navigateTo?: { screen: string; params?: any }
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    type: 'APPOINTMENT',
    title: 'Tu cita está confirmada',
    body: 'Dr. María Pérez confirmó tu cita para mañana a las 10:30 AM.',
    timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: 'n2',
    type: 'PAYMENT',
    title: 'Pago recibido',
    body: 'Recibiste un pago de $85.000 COP por consulta veterinaria.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: 'n3',
    type: 'REVIEW',
    title: 'Nueva reseña',
    body: 'Laura G. dejó una reseña de 5 estrellas en tu perfil.',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: 'n4',
    type: 'SYSTEM',
    title: 'Bienvenido a Nvet Care',
    body: 'Completa tu perfil para empezar a recibir citas.',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
]

const TYPE_GLYPHS: Record<NotifType, string> = {
  APPOINTMENT: '📅',
  PAYMENT: '💰',
  SYSTEM: '⚙️',
  REVIEW: '⭐',
}

const TYPE_LABELS: Record<NotifType, string> = {
  APPOINTMENT: 'Cita',
  PAYMENT: 'Pago',
  SYSTEM: 'Sistema',
  REVIEW: 'Reseña',
}

export default function NotificationsScreen({ navigation }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS)
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined')

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  )

  const handleMarkAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const handleNotificationPress = useCallback((notif: Notification) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
    )
    if (notif.navigateTo) {
      navigation.navigate(notif.navigateTo.screen, notif.navigateTo.params)
    }
  }, [navigation])

  const handleRequestPermission = useCallback(() => {
    setPermissionStatus('granted')
  }, [])

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notificaciones</Text>
          {unreadCount > 0 && (
            <Text style={styles.subtitle}>{unreadCount} sin leer</Text>
          )}
        </View>
        {unreadCount > 0 && (
          <Pressable
            onPress={handleMarkAllRead}
            hitSlop={6}
            accessibilityRole="link"
            accessibilityLabel="Marcar todas como leídas"
          >
            <Text style={styles.markAllText}>Marcar todas</Text>
          </Pressable>
        )}
      </View>

      {permissionStatus === 'undetermined' && (
        <Card variant="flat" style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>🔔 Activa las notificaciones</Text>
          <Text style={styles.permissionText}>
            Recibe avisos en tiempo real sobre tus citas, pagos y reseñas.
          </Text>
          <View style={{ marginTop: 12 }}>
            <Button
              label="Permitir notificaciones"
              onPress={handleRequestPermission}
              fullWidth
            />
          </View>
        </Card>
      )}

      {permissionStatus === 'denied' && (
        <Card
          variant="flat"
          style={StyleSheet.flatten([
            styles.permissionCard,
            { borderColor: UI_COLORS.error },
          ])}
        >
          <Text style={styles.permissionTitle}>⚠️ Notificaciones desactivadas</Text>
          <Text style={styles.permissionText}>
            Activa las notificaciones desde la configuración del sistema.
          </Text>
        </Card>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <NotificationCard
            notification={item}
            onPress={() => handleNotificationPress(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <EmptyState
              glyph="📭"
              title="Sin notificaciones"
              subtitle="Te avisaremos cuando haya algo nuevo."
            />
          </View>
        }
      />
    </SafeAreaView>
  )
}

interface NotificationCardProps {
  notification: Notification
  onPress: () => void
}

function NotificationCard({ notification, onPress }: NotificationCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.notifCard,
        !notification.read && styles.notifCardUnread,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.body}. ${formatRelativeTime(notification.timestamp)}${
        !notification.read ? '. Sin leer' : ''
      }`}
    >
      <View style={styles.notifGlyph}>
        <Text style={styles.notifGlyphText}>{TYPE_GLYPHS[notification.type]}</Text>
        {!notification.read && <View style={styles.unreadDot} />}
      </View>

      <View style={{ flex: 1 }}>
        <View style={styles.notifTopRow}>
          <Badge
            label={TYPE_LABELS[notification.type]}
            tone={notification.type === 'PAYMENT' ? 'gold' : notification.type === 'APPOINTMENT' ? 'sage' : 'muted'}
            size="sm"
            outline
          />
          <Text style={styles.notifTime}>
            {formatRelativeTime(notification.timestamp)}
          </Text>
        </View>
        <Text
          style={[styles.notifTitle, !notification.read && styles.notifTitleUnread]}
          numberOfLines={1}
        >
          {notification.title}
        </Text>
        <Text style={styles.notifBody} numberOfLines={2}>
          {notification.body}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    gap: 8,
  },
  back: { fontSize: 28, color: UI_COLORS.sage },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  subtitle: { fontSize: 12, color: UI_COLORS.sage, marginTop: 2, fontWeight: '600' },
  markAllText: { fontSize: 13, color: UI_COLORS.sage, fontWeight: '600' },
  permissionCard: {
    margin: 16,
    marginBottom: 0,
    borderColor: UI_COLORS.gold,
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginBottom: 4,
  },
  permissionText: { fontSize: 13, color: UI_COLORS.muted, lineHeight: 18 },
  listContent: { padding: 16 },
  emptyBox: { paddingTop: 60 },
  notifCard: {
    flexDirection: 'row',
    backgroundColor: UI_COLORS.card,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
    gap: 12,
  },
  notifCardUnread: {
    borderColor: UI_COLORS.sage,
    backgroundColor: '#5B75530a',
  },
  notifGlyph: { position: 'relative' },
  notifGlyphText: { fontSize: 26 },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: UI_COLORS.sage,
    borderWidth: 2,
    borderColor: UI_COLORS.card,
  },
  notifTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  notifTime: { fontSize: 11, color: UI_COLORS.muted },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: UI_COLORS.text,
    marginBottom: 2,
  },
  notifTitleUnread: { fontWeight: '800' },
  notifBody: { fontSize: 13, color: UI_COLORS.muted, lineHeight: 18 },
})
