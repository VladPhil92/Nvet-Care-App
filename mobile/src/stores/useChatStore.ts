import { create } from 'zustand';
import io, { Socket } from 'socket.io-client';
import { API_URL } from '../services/api';
import chatService from '../services/chat.service';
import { secureStorage } from '../lib/secureStorage';

interface Message {
  id: string;
  appointmentId?: string;
  senderId: string;
  content: string;
  type: 'TEXT' | 'PRICE' | 'SYSTEM';
  priceData?: {
    serviceName: string;
    priceCop: number;
    priceCtg?: number;
    isVerified: boolean;
  };
  createdAt: string;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: 'VET' | 'CLIENT';
  };
}

/**
 * Estrategia de reconexión:
 *  - Backoff exponencial con jitter aleatorio para evitar thundering herd.
 *  - Cap máximo de 30s entre intentos.
 *  - Después de N intentos fallidos consecutivos, marcar como `connectionDead`
 *    y dejar de intentar automáticamente (el usuario puede pedir reconect manual).
 *  - Al reconectar exitosamente, resync de mensajes via HTTP para no perder
 *    eventos que ocurrieron mientras estuvimos offline.
 */
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const RECONNECT_MAX_ATTEMPTS = 10
const RECONNECT_JITTER_RATIO = 0.3

function backoffWithJitter(attempt: number): number {
  const exp = Math.min(
    RECONNECT_MAX_MS,
    RECONNECT_BASE_MS * Math.pow(2, attempt),
  )
  const jitter = exp * RECONNECT_JITTER_RATIO * (Math.random() * 2 - 1)
  return Math.max(RECONNECT_BASE_MS, Math.round(exp + jitter))
}

interface ChatState {
  messages: Message[];
  socket: Socket | null;
  isConnected: boolean;
  isLoading: boolean;
  isSending: boolean;
  typingUsers: string[];
  error: string | null;

  reconnectAttempt: number;
  isReconnecting: boolean;
  connectionDead: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  currentAppointmentId: string | null;

  connectSocket: (appointmentId: string) => Promise<void>;
  disconnectSocket: () => void;
  reconnect: () => Promise<void>;
  fetchMessages: (appointmentId: string) => Promise<void>;
  sendMessage: (appointmentId: string, content: string) => Promise<void>;
  sharePrice: (appointmentId: string, priceData: {
    serviceName: string;
    priceCop: number;
    priceCtg?: number;
  }) => Promise<void>;
  setTyping: (appointmentId: string, isTyping: boolean) => void;
  clearMessages: () => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  socket: null,
  isConnected: false,
  isLoading: false,
  isSending: false,
  typingUsers: [],
  error: null,

  reconnectAttempt: 0,
  isReconnecting: false,
  connectionDead: false,
  reconnectTimer: null,
  currentAppointmentId: null,

  connectSocket: async (appointmentId: string) => {
    const existingTimer = get().reconnectTimer
    if (existingTimer) clearTimeout(existingTimer)

    try {
      // WebSocket authentication follows the same canonical protected-session
      // boundary as HTTP. No bearer credential may be read from AsyncStorage.
      const token = await secureStorage.getAccessToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const socket = io(API_URL.replace('/api', ''), {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });

      socket.on('connect', async () => {
        const wasReconnect = get().reconnectAttempt > 0
        set({
          isConnected: true,
          isReconnecting: false,
          connectionDead: false,
          reconnectAttempt: 0,
          error: null,
        });
        socket.emit('joinAppointment', appointmentId);

        if (wasReconnect) {
          try {
            const messages = await chatService.getMessages(appointmentId);
            set({ messages });
          } catch (e) {
            console.warn('Resync after reconnect failed:', e);
          }
        }
      });

      socket.on('disconnect', (reason: string) => {
        set({ isConnected: false });
        if (reason === 'io client disconnect') return;
        get().reconnect();
      });

      socket.on('connect_error', (err: Error) => {
        console.warn('Socket connect_error:', err.message);
        set({ isConnected: false });
        get().reconnect();
      });

      socket.on('message', (message: Message) => {
        set((state) => ({
          messages: [...state.messages, message],
        }));
      });

      socket.on('typing', ({ userId, isTyping }: { userId: string; isTyping: boolean }) => {
        set((state) => {
          if (isTyping) {
            return {
              typingUsers: state.typingUsers.includes(userId)
                ? state.typingUsers
                : [...state.typingUsers, userId],
            };
          }
          return {
            typingUsers: state.typingUsers.filter((id) => id !== userId),
          };
        });
      });

      socket.on('priceShared', (message: Message) => {
        set((state) => ({
          messages: [...state.messages, message],
        }));
      });

      socket.on('error', (error: any) => {
        console.error('Socket error:', error);
        set({ error: error?.message || 'Error en la conexión del chat' });
      });

      set({
        socket,
        currentAppointmentId: appointmentId,
      });
    } catch (error: any) {
      console.error('Failed to connect socket:', error);
      set({ error: error.message || 'Error al conectar al chat' });
      get().reconnect();
    }
  },

  reconnect: async () => {
    const state = get();

    if (state.isReconnecting || !state.currentAppointmentId) return;

    if (state.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      set({
        connectionDead: true,
        isReconnecting: false,
        error:
          'Conexión perdida. Verifica tu red y vuelve a abrir el chat para reintentar.',
      });
      return;
    }

    const delay = backoffWithJitter(state.reconnectAttempt);
    set({ isReconnecting: true });

    const timer = setTimeout(async () => {
      const { currentAppointmentId, connectSocket } = get();
      if (!currentAppointmentId) {
        set({ isReconnecting: false, reconnectTimer: null });
        return;
      }
      set((s) => ({
        reconnectAttempt: s.reconnectAttempt + 1,
        reconnectTimer: null,
      }));
      const oldSocket = get().socket;
      if (oldSocket) {
        oldSocket.removeAllListeners();
        oldSocket.disconnect();
      }
      await connectSocket(currentAppointmentId);
    }, delay);

    set({ reconnectTimer: timer });
  },

  disconnectSocket: () => {
    const { socket, reconnectTimer } = get();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    set({
      socket: null,
      isConnected: false,
      isReconnecting: false,
      connectionDead: false,
      reconnectAttempt: 0,
      reconnectTimer: null,
      currentAppointmentId: null,
      messages: [],
      typingUsers: [],
    });
  },

  fetchMessages: async (appointmentId: string) => {
    set({ isLoading: true, error: null });
    try {
      const messages = await chatService.getMessages(appointmentId);
      set({ messages, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al cargar los mensajes',
        isLoading: false,
      });
    }
  },

  sendMessage: async (appointmentId: string, content: string) => {
    const { socket } = get();
    set({ isSending: true, error: null });

    try {
      if (socket && socket.connected) {
        socket.emit('message', { appointmentId, content });
        set({ isSending: false });
      } else {
        const message = await chatService.sendMessage(appointmentId, content);
        set((state) => ({
          messages: [...state.messages, message],
          isSending: false,
        }));
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al enviar el mensaje',
        isSending: false,
      });
      throw error;
    }
  },

  sharePrice: async (appointmentId: string, priceData: {
    serviceName: string;
    priceCop: number;
    priceCtg?: number;
  }) => {
    const { socket } = get();
    set({ isSending: true, error: null });

    try {
      if (socket && socket.connected) {
        socket.emit('sharePrice', { appointmentId, priceData });
        set({ isSending: false });
      } else {
        const message = await chatService.sharePrice(appointmentId, priceData);
        set((state) => ({
          messages: [...state.messages, message],
          isSending: false,
        }));
      }
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Error al compartir el precio',
        isSending: false,
      });
      throw error;
    }
  },

  setTyping: (appointmentId: string, isTyping: boolean) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('typing', { appointmentId, isTyping });
    }
  },

  clearMessages: () => {
    set({ messages: [], typingUsers: [] });
  },

  clearError: () => {
    set({ error: null });
  },
}));
