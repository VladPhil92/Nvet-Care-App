import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Card,
  EmptyState,
  Skeleton,
  UI_COLORS,
} from '../../components/ui/primitives'
import {
  useAppointmentsQuery,
  useTransactionsQuery,
} from '../../hooks/queries/useMobileQueries'
import { formatRelativeTime, formatCOP } from '../../utils/format'

interface Props {
  navigation: any
}

type NotifType = 'APPOINTMENT' | 'PAYMENT' | 'SYSTEM'

interface DerivedNotif {
  id: string
  type: NotifType
  glyph: string
  title: string
  body: string
  timestamp: string
  read: boolean
  screen?: string
  screenParams?: Record<string, string>
}

const APPT_STATUS_NOTIF: Record<
  string,
  { glyph: string; title: string; bodyFn: (pet: string) => string }
> = {
  CONFIRMED: {
    glyph: '✅',
    title: 'Cita confirmada',
    bodyFn: (pet) => `La cita para ${pet} ha sido confirmada. Estamos preparando todo.`,
  },
  IN_PROGRESS: {
    glyph: '🐾',
    title: 'Cita en curso',
    bodyFn: (pet) => `La visita para ${pet} está en progreso ahora.`,
  },
  COMPLETED: {
    glyph: '🎉',
    title: 'Cita completada',
    bodyFn: (pet) => `La consulta de ${pet} ha finalizado. Puedes dejar una reseña.`,
  },
  CANCELLED: {
    glyph: '❌',
    title: 'Cita cancelada',
    bodyFn: (pet) => `La cita para ${pet} fue cancelada.`,
  },
  PENDING: {
    glyph: '⏳',
    title: 'Cita solicitada',
    bodyFn: (pet) => `Tu solicitud de cita para ${pet} está pendiente de confirmación.`,
  },
}

const TXN_TYPE_NOTIF: Record<
  string,
  { glyph: string; titleFn: (amt: number) => string; body: string }
> = {
  PAYMENT: {
    glyph: '💳',
    titleFn: (amt) => `Pago de ${formatCOP(amt)}`,
    body: 'El pago por tu consulta ha sido procesado.',
  },
  DEPOSIT: {
    glyph: '💰',
    titleFn: (amt) => `Recarga de ${formatCOP(amt)}`,
    body: 'Tu billetera ha sido recargada exitosamente.',
  },
  WITHDRAWAL: {
    glyph: '🏦',
    titleFn: (amt) => `Retiro de ${formatCOP(amt)}`,
    body: 'Tu solicitud de retiro fue enviada.',
  },
  COMMISSION: {
    glyph: '📊',
    titleFn: (amt) => `Comisión de ${formatCOP(amt)}`,
    body: 'Se aplicó la comisión de la plataforma a esta transacción.',
  },
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export default function NotificationsScreen({ navigation }: Props) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set())

  const sevenDaysAgo = useMemo(() => {
    const d = new Date()
    d.setTime(d.getTime() - SEVEN_DAYS_MS)
    return d.toISOString().split('T')[0]
  }, [])

  const apptQuery = useAppointmentsQuery({ startDate: sevenDaysAgo })
  const txnQuery = useTransactionsQuery({})

  const isLoading = apptQuery.isLoading || txnQuery.isLoading
  const isRefreshing = apptQuery.isFetching || txnQuery.isFetching

  const notifications = useMemo<DerivedNotif[]>(() => {
    const items: DerivedNotif[] = []

    // Derive from appointments (last 7 days)
    for (const appt of apptQuery.data ?? []) {
      const tpl = APPT_STATUS_NOTIF[appt.status]
      if (!tpl) continue
      const petName = appt.pet?.name ?? 'tu mascota'
      items.push({
        id: `appt-${appt.id}-${appt.status}`,
        type: 'APPOINTMENT',
        glyph: tpl.glyph,
        title: tpl.title,
        body: tpl.bodyFn(petName),
        timestamp: appt.updatedAt ?? appt.createdAt,
        read: readIds.has(`appt-${appt.id}-${appt.status}`),
        screen: 'AppointmentDetail',
        screenParams: { appointmentId: appt.id },
      })
    }

    // Derive from recent transactions (last 20 confirmed/liquidated)
    const confirmedTxns = (txnQuery.data ?? [])
      .filter((t) => t.status === 'CONFIRMED' || t.status === 'LIQUIDATED')
      .slice(0, 20)

    for (const txn of confirmedTxns) {
      const type = txn.type ?? 'PAYMENT'
      const tpl = TXN_TYPE_NOTIF[type]
      if (!tpl) continue
      items.push({
        id: `txn-${txn.id}`,
        type: 'PAYMENT',
        glyph: tpl.glyph,
        title: tpl.titleFn(txn.amountCop),
        body: txn.description ?? tpl.body,
        timestamp: txn.updatedAt ?? txn.createdAt,
        read: readIds.has(`txn-${txn.id}`),
      })
    }

    // Sort by timestamp descending
    return items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
  }, [apptQuery.data, txnQuery.data, readIds])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  const handleRefresh = useCallback(() => {
    apptQuery.refetch()
    txnQuery.refetch()
  }, [apptQuery, txnQuery])

  const handlePress = useCallback(
    (notif: DerivedNotif) => {
      setReadIds((prev) => new Set([...prev, notif.id]))
      if (notif.screen) {
        navigation.navigate(notif.screen, notif.screenParams)
      }
    },
    [navigation],
  )

  const handleMarkAllRead = useCallback(() => {
    setReadIds(new Set(notifications.map((n) => n.id)))
  }, [notifications])

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

      {isLoading ? (
        <View style={styles.skeletonWrap}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={80} borderRadius={12} />
          ))}
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
              notif={item}
              onPress={() => handlePress(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <EmptyState
                glyph="📭"
                title="Sin notificaciones recientes"
                subtitle="Aparecerán aquí cuando haya actualizaciones de citas o pagos."
              />
            </View>
          }
        />
      )}
    </SafeAreaView>
  )
}

interface NotifCardProps {
  notif: DerivedNotif
  onPress: () => void
}

function NotifCard({ notif, onPress }: NotifCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        !notif.read && styles.cardUnread,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${notif.title}. ${notif.body}. ${formatRelativeTime(notif.timestamp)}${
        !notif.read ? '. Sin leer' : ''
      }`}
    >
      <View style={styles.glyphWrap}>
        <Text style={styles.glyph}>{notif.glyph}</Text>
        {!notif.read && <View style={styles.unreadDot} />}
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {notif.title}
          </Text>
          <Text style={styles.cardTime}>{formatRelativeTime(notif.timestamp)}</Text>
        </View>
        <Text style={styles.cardText} numberOfLines={2}>
          {notif.body}
        </Text>
      </View>
      {notif.screen && <Text style={styles.arrow}>›</Text>}
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
  listContent: { padding: 16, paddingBottom: 40 },
  emptyBox: { marginTop: 60 },
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
