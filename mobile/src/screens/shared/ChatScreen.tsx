import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Badge,
  Skeleton,
  EmptyState,
  UI_COLORS,
} from '../../components/ui/primitives'
import { useChatStore } from '../../stores/useChatStore'
import { useCurrentUserQuery } from '../../hooks/queries/useMobileQueries'
import { formatCOP, formatRelativeTime } from '../../utils/format'

/**
 * ChatScreen — chat arbitrado entre cliente y veterinario.
 *
 * Capacidades:
 *  - Conexión WebSocket real-time vía `useChatStore` (con reconexión exponencial).
 *  - 3 tipos de mensaje: TEXT (burbujas), PRICE (card especial), SYSTEM (centrado).
 *  - Diferenciación visual cliente/vet: burbuja sage (cliente) vs gold (vet).
 *  - Banner de estado de conexión (online / reconectando / desconectado).
 *  - Auto-scroll al bottom al recibir mensajes nuevos.
 *  - Input con autofocus y send button deshabilitado si está vacío.
 *  - Badge "Chat monitoreado" para reforzar el carácter arbitrado.
 *
 * Decisiones:
 *  - Se usa `useChatStore` (Zustand) en lugar de React Query porque el chat es
 *    inherentemente streaming (push) en lugar de pull-based. El store ya maneja
 *    fetch inicial via HTTP + suscripción Socket.io.
 *  - El componente se desconecta del socket al desmontarse (`useEffect` cleanup).
 *  - Se aprovecha `connectionDead` para mostrar CTA de reconexión manual.
 */

interface Props {
  navigation: any
  route: { params: { appointmentId: string } }
}

export default function ChatScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params

  const userQuery = useCurrentUserQuery()
  const currentUserId = userQuery.data?.id

  const [text, setText] = useState('')
  const listRef = useRef<FlatList>(null)

  const messages = useChatStore((s) => s.messages)
  const isConnected = useChatStore((s) => s.isConnected)
  const isReconnecting = useChatStore((s) => s.isReconnecting)
  const connectionDead = useChatStore((s) => s.connectionDead)
  const isLoading = useChatStore((s) => s.isLoading)
  const isSending = useChatStore((s) => s.isSending)
  const error = useChatStore((s) => s.error)
  const typingUsers = useChatStore((s) => s.typingUsers)
  const connectSocket = useChatStore((s) => s.connectSocket)
  const disconnectSocket = useChatStore((s) => s.disconnectSocket)
  const fetchMessages = useChatStore((s) => s.fetchMessages)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const reconnect = useChatStore((s) => s.reconnect)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const clearError = useChatStore((s) => s.clearError)

  // Conectar al montar; desconectar al desmontar
  useEffect(() => {
    fetchMessages(appointmentId).catch(() => {
      /* el store loguea el error */
    })
    connectSocket(appointmentId).catch(() => {
      /* idem */
    })
    return () => {
      disconnectSocket()
      clearMessages()
    }
  }, [appointmentId, connectSocket, disconnectSocket, fetchMessages, clearMessages])

  // Auto-scroll al final cuando llega un mensaje nuevo
  useEffect(() => {
    if (messages.length > 0) {
      // Pequeño delay para permitir render
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true })
      }, 50)
    }
  }, [messages.length])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    try {
      await sendMessage(appointmentId, trimmed)
    } catch {
      // El store guarda el error y se muestra en banner
    }
  }, [appointmentId, sendMessage, text])

  const isTypingByOther = useMemo(
    () => typingUsers.some((id) => id !== currentUserId),
    [typingUsers, currentUserId],
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
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
          <Text style={styles.title}>Chat</Text>
          <Text style={styles.subtitle}>
            <Badge label="🛡 Chat monitoreado" tone="info" outline size="sm" />
          </Text>
        </View>
        <ConnectionDot
          isConnected={isConnected}
          isReconnecting={isReconnecting}
          connectionDead={connectionDead}
        />
      </View>

      {/* Reconnect banner */}
      {!isConnected && !isLoading && (
        <ReconnectBanner
          isReconnecting={isReconnecting}
          connectionDead={connectionDead}
          onReconnect={() => reconnect()}
        />
      )}

      {/* Error banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
          <Pressable onPress={clearError} hitSlop={6}>
            <Text style={styles.errorDismiss}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* Lista de mensajes */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {isLoading && messages.length === 0 ? (
          <View style={styles.loadingBox}>
            {[0, 1, 2].map((i) => (
              <Skeleton
                key={i}
                width={i % 2 === 0 ? '60%' : '40%'}
                height={40}
                borderRadius={12}
                style={{
                  marginBottom: 8,
                  marginLeft: i % 2 === 0 ? 16 : undefined,
                  marginRight: i % 2 === 1 ? 16 : undefined,
                  alignSelf: i % 2 === 0 ? 'flex-start' : 'flex-end',
                }}
              />
            ))}
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyBox}>
            <EmptyState
              glyph="💬"
              title="Inicia la conversación"
              subtitle="Escribe el primer mensaje para comenzar a chatear con el veterinario."
            />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesContent}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isOwn={item.senderId === currentUserId}
              />
            )}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: false })
            }
          />
        )}

        {/* Typing indicator */}
        {isTypingByOther && (
          <View style={styles.typingBox}>
            <Text style={styles.typingText}>Escribiendo…</Text>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escribe un mensaje…"
            placeholderTextColor={UI_COLORS.muted}
            style={styles.input}
            multiline
            maxLength={1000}
            accessibilityLabel="Mensaje a enviar"
            editable={!isSending}
          />
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || isSending}
            style={[
              styles.sendBtn,
              (!text.trim() || isSending) && styles.sendBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje"
            accessibilityState={{ disabled: !text.trim(), busy: isSending }}
          >
            {isSending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// =====================================================================
// MessageBubble
// =====================================================================

interface MessageBubbleProps {
  message: any
  isOwn: boolean
}

function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const isVet = message.sender?.role === 'VET'

  // SYSTEM message
  if (message.type === 'SYSTEM') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    )
  }

  // PRICE message
  if (message.type === 'PRICE' && message.priceData) {
    return (
      <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
        <View style={[styles.priceCard, isVet && styles.priceCardVet]}>
          {message.priceData.isVerified && (
            <Badge label="✓ Precio oficial" tone="success" size="sm" />
          )}
          <Text style={styles.priceServiceName}>
            {message.priceData.serviceName}
          </Text>
          <Text style={styles.priceAmount}>
            {formatCOP(message.priceData.priceCop)}
          </Text>
          {message.priceData.priceCtg && (
            <Text style={styles.priceCtg}>
              o {message.priceData.priceCtg} CTG
            </Text>
          )}
          <Text style={styles.bubbleTime}>
            {formatRelativeTime(message.createdAt)}
          </Text>
        </View>
      </View>
    )
  }

  // TEXT message
  return (
    <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
      <View
        style={[
          styles.bubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
          isVet && !isOwn && styles.bubbleVet,
        ]}
      >
        {!isOwn && message.sender && (
          <Text style={[styles.senderName, isVet && styles.senderNameVet]}>
            {isVet ? 'Dr. ' : ''}
            {message.sender.firstName} {message.sender.lastName}
          </Text>
        )}
        <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
          {message.content}
        </Text>
        <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
          {formatRelativeTime(message.createdAt)}
        </Text>
      </View>
    </View>
  )
}

// =====================================================================
// ConnectionDot + ReconnectBanner
// =====================================================================

interface ConnectionDotProps {
  isConnected: boolean
  isReconnecting: boolean
  connectionDead: boolean
}

function ConnectionDot({
  isConnected,
  isReconnecting,
  connectionDead,
}: ConnectionDotProps) {
  const color = connectionDead
    ? UI_COLORS.error
    : isReconnecting
    ? UI_COLORS.warning
    : isConnected
    ? UI_COLORS.success
    : UI_COLORS.muted
  const label = connectionDead
    ? 'Desconectado'
    : isReconnecting
    ? 'Reconectando'
    : isConnected
    ? 'En vivo'
    : 'Sin conexión'

  return (
    <View style={styles.connectionDot} accessibilityLabel={label}>
      <View style={[styles.connectionPulse, { backgroundColor: color }]} />
      <Text style={[styles.connectionLabel, { color }]}>{label}</Text>
    </View>
  )
}

function ReconnectBanner({
  isReconnecting,
  connectionDead,
  onReconnect,
}: {
  isReconnecting: boolean
  connectionDead: boolean
  onReconnect: () => void
}) {
  if (connectionDead) {
    return (
      <View style={[styles.banner, styles.bannerError]}>
        <Text style={styles.bannerText}>
          Conexión perdida. Verifica tu internet.
        </Text>
        <Pressable onPress={onReconnect} hitSlop={6}>
          <Text style={styles.bannerCta}>Reintentar</Text>
        </Pressable>
      </View>
    )
  }

  if (isReconnecting) {
    return (
      <View style={[styles.banner, styles.bannerWarning]}>
        <ActivityIndicator size="small" color={UI_COLORS.warning} />
        <Text style={[styles.bannerText, { marginLeft: 8 }]}>
          Reconectando…
        </Text>
      </View>
    )
  }

  return null
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
  back: { fontSize: 28, color: UI_COLORS.sage, marginRight: 4 },
  title: { fontSize: 17, fontWeight: '700', color: UI_COLORS.text },
  subtitle: { marginTop: 4, flexDirection: 'row' },
  connectionDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectionPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Banners
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerWarning: { backgroundColor: '#DD6B201a' },
  bannerError: { backgroundColor: '#C530301a' },
  bannerText: { fontSize: 13, color: UI_COLORS.text, flex: 1 },
  bannerCta: { fontSize: 13, color: UI_COLORS.sage, fontWeight: '700' },
  errorBanner: {
    backgroundColor: '#C530301a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 12, color: UI_COLORS.error },
  errorDismiss: {
    color: UI_COLORS.error,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  // Lista
  messagesContent: { padding: 12, gap: 8, flexGrow: 1 },
  loadingBox: { padding: 16, gap: 8 },
  emptyBox: { flex: 1, justifyContent: 'center' },
  // Bubble
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
  },
  bubbleOther: {
    backgroundColor: UI_COLORS.card,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  bubbleOwn: {
    backgroundColor: UI_COLORS.sage,
    borderTopRightRadius: 4,
  },
  bubbleVet: {
    borderColor: UI_COLORS.gold,
    borderLeftWidth: 3,
  },
  senderName: {
    fontSize: 11,
    color: UI_COLORS.muted,
    fontWeight: '700',
    marginBottom: 2,
  },
  senderNameVet: { color: UI_COLORS.gold },
  bubbleText: { fontSize: 14, color: UI_COLORS.text, lineHeight: 19 },
  bubbleTextOwn: { color: '#FFFFFF' },
  bubbleTime: {
    fontSize: 10,
    color: UI_COLORS.muted,
    marginTop: 4,
    fontWeight: '500',
  },
  bubbleTimeOwn: { color: '#FFFFFFcc' },
  // System
  systemRow: { alignItems: 'center', paddingVertical: 8 },
  systemText: {
    fontSize: 12,
    color: UI_COLORS.muted,
    backgroundColor: UI_COLORS.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    fontStyle: 'italic',
  },
  // Price card
  priceCard: {
    backgroundColor: UI_COLORS.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 2,
    borderColor: UI_COLORS.sage,
    maxWidth: '78%',
    gap: 4,
  },
  priceCardVet: { borderColor: UI_COLORS.gold },
  priceServiceName: {
    fontSize: 14,
    fontWeight: '700',
    color: UI_COLORS.text,
    marginTop: 6,
  },
  priceAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: UI_COLORS.sage,
  },
  priceCtg: { fontSize: 12, color: UI_COLORS.gold, fontWeight: '600' },
  // Typing
  typingBox: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: { fontSize: 12, color: UI_COLORS.muted, fontStyle: 'italic' },
  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.card,
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.border,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.bg,
    fontSize: 14,
    color: UI_COLORS.text,
    borderWidth: 1,
    borderColor: UI_COLORS.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: UI_COLORS.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: UI_COLORS.border },
  sendBtnText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
})
