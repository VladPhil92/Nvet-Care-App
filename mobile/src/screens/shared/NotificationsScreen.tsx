import React, { useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  EmptyState,
  Skeleton,
  UI_COLORS,
} from '../../components/ui/primitives'
import { qk } from '../../lib/queryKeys'
import { STALE_TIMES } from '../../lib/queryClient'
import notificationService, {
  NotificationItem,
} from '../../services/notification.service'
import { formatRelativeTime } from '../../utils/format'

interface Props {
  navigation: any
}

const CATEGORY_GLYPHS: Record<string, string> = {
  APPOINTMENT: '🐾',
  PAYMENT: '💳',
  PREVENTIVE: '🩺',
  SYSTEM: '🔔',
}

export default function NotificationsScreen({ navigation }: Props) {
  const queryClient = useQueryClient()
  const inboxQuery = useQuery({
    queryKey: qk.notifications.inbox(50),
    queryFn: () => notificationService.getInbox(50),
    staleTime: STALE_TIMES.SHORT,
  })

  const refreshNotificationCache = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: qk.notifications.all })
  }, [queryClient])

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markRead(id),
    onSuccess: refreshNotificationCache,
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: refreshNotificationCache,
  })

  const handleRefresh = useCallback(() => {
    void inboxQuery.refetch()
  }, [inboxQuery])

  const handlePress = useCallback(
    async (notification: NotificationItem) => {
      if (!notification.readAt) {
        try {
          await markReadMutation.mutateAsync(notification.id)
        } catch {
          // Reading state must not block the user from opening the related flow.
        }
      }

      const appointmentId = notification.metadata?.appointmentId
      if (typeof appointmentId === 'string' && appointmentId.length > 0) {
        navigation.navigate('AppointmentDetail', { appointmentId })
      }
    },
    [markReadMutation, navigation],
  )

  const inbox = inboxQuery.data
  const notifications = inbox?.items ?? []
  const unreadCount = inbox?.summary.unread ?? 0
  const isRefreshing = inboxQuery.isFetching && !inboxQuery.isLoading

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
            onPress={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Marcar todas como leídas"
          >
            <Text style={styles.markAllText}>
              {markAllReadMutation.isPending ? 'Marcando…' : 'Marcar todas'}
            </Text>
          </Pressable>
        )}
      </View>

      {inboxQuery.isLoading ? (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={80} borderRadius={12} />
          ))}
        </View>
      ) : inboxQuery.isError ? (
        <View style={styles.emptyBox}>
          <EmptyState
            glyph="⚠️"
            title="No pudimos cargar tus notificaciones"
            subtitle="Verifica tu conexión y vuelve a intentarlo."
          />
          <Pressable
            onPress={handleRefresh}
            disabled={inboxQuery.isFetching}
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar notificaciones"
            style={({ pressed }) => [
              styles.retryButton,
              pressed && { opacity: 0.85 },
              inboxQuery.isFetching && { opacity: 0.55 },
            ]}
          >
            <Text style={styles.retryText}>
              {inboxQuery.isFetching ? 'Reintentando…' : 'Reintentar'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={UI_COLORS.sage}
            />
          }
          renderItem={({ item }) => (
            <NotifCard
              notification={item}
              onPress={() => void handlePress(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <EmptyState
                glyph="📭"
                title="Sin notificaciones"
                subtitle="Aparecerán aquí las actualizaciones de citas, pagos y cuidado preventivo."
              />
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

interface NotifCardProps {
  notification: NotificationItem
  onPress: () => void
}

function NotifCard({ notification, onPress }: NotifCardProps) {
  const unread = !notification.readAt
  const appointmentId = notification.metadata?.appointmentId
  const hasAction = typeof appointmentId === 'string' && appointmentId.length > 0
  const glyph = CATEGORY_GLYPHS[notification.category] ?? CATEGORY_GLYPHS.SYSTEM

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        unread && styles.cardUnread,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}. ${notification.message}. ${formatRelativeTime(notification.occurredAt)}${
        unread ? '. Sin leer' : ''
      }`}
    >
      <View style={styles.glyphWrap}>
        <Text style={styles.glyph}>{glyph}</Text>
        {unread && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {notification.title}
          </Text>
          <Text style={styles.cardTime}>
            {formatRelativeTime(notification.occurredAt)}
          </Text>
        </View>
        <Text style={styles.cardText} numberOfLines={2}>
          {notification.message}
        </Text>
      </View>
      {hasAction && <Text style={styles.arrow}>›</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: UI_COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: UI_COLORS.border,
    backgroundColor: UI_COLORS.card,
  },
  back: { fontSize: 32, lineHeight: 32, color: UI_COLORS.text },
  title: { fontSize: 18, fontWeight: '800', color: UI_COLORS.text },
  subtitle: { fontSize: 12, color: UI_COLORS.muted, marginTop: 1 },
  markAllText: { fontSize: 13, color: UI_COLORS.sage, fontWeight: '600' },
  skeletonWrap: { padding: 16, gap: 10 },
  listContent: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  emptyBox: { marginTop: 60, paddingHorizontal: 16 },
  retryButton: {
    alignSelf: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: UI_COLORS.sage,
  },
  retryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: UI_COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  cardUnread: {
    borderColor: UI_COLORS.sage,
    backgroundColor: '#F5FBF7',
  },
  glyphWrap: { position: 'relative' },
  glyph: { fontSize: 24 },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: UI_COLORS.sage,
  },
  cardBody: { flex: 1 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: UI_COLORS.text, flex: 1 },
  cardTime: { fontSize: 11, color: UI_COLORS.muted, flexShrink: 0 },
  cardText: { fontSize: 13, color: UI_COLORS.muted, lineHeight: 18 },
  arrow: { fontSize: 22, color: UI_COLORS.muted, alignSelf: 'center' },
})
