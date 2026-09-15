import AsyncStorage from '@react-native-async-storage/async-storage'
import { queryClient } from './queryClient'
import { clearAllPendingPaymentRecovery } from './bookingPaymentRecovery'
import { useAppointmentStore } from '../stores/useAppointmentStore'
import { useChatStore } from '../stores/useChatStore'
import { useWalletStore } from '../stores/useWalletStore'

export const MOBILE_QUERY_CACHE_STORAGE_KEY = 'nvet-care-mobile-query-cache'
export const MOBILE_SESSION_OWNER_STORAGE_KEY = 'nvet-care-mobile-session-owner-v1'

const EMPTY_WALLET_BALANCE = {
  ctgBalance: 0,
  copBalance: 0,
  pendingCtg: 0,
  pendingCop: 0,
}

function resetUserScopedRuntimeState() {
  useChatStore.getState().disconnectSocket()
  useChatStore.getState().clearMessages()
  useChatStore.setState({
    typingUsers: [],
    error: null,
    reconnectAttempt: 0,
    isReconnecting: false,
    connectionDead: false,
    currentAppointmentId: null,
  })

  useAppointmentStore.setState({
    appointments: [],
    selectedAppointment: null,
    tracking: null,
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    error: null,
  })

  useWalletStore.setState({
    balance: EMPTY_WALLET_BALANCE,
    transactions: [],
    isLoading: false,
    isProcessing: false,
    error: null,
  })
}

async function purgePersistedUserState() {
  await Promise.all([
    AsyncStorage.removeItem(MOBILE_QUERY_CACHE_STORAGE_KEY).catch(() => undefined),
    clearAllPendingPaymentRecovery().catch(() => undefined),
  ])
}

/**
 * Binds persisted client state to a single authenticated Nvet user.
 *
 * A missing owner is treated as untrusted legacy state and purged. This makes
 * the Phase 46 migration fail closed instead of hydrating data written before
 * per-user cache ownership existed.
 */
export async function adoptSessionCacheOwner(userId: string) {
  let currentOwner: string | null = null

  try {
    currentOwner = await AsyncStorage.getItem(MOBILE_SESSION_OWNER_STORAGE_KEY)
  } catch {
    // Storage metadata cannot be trusted; clear runtime data below.
  }

  if (currentOwner !== userId) {
    await queryClient.cancelQueries().catch(() => undefined)
    queryClient.clear()
    resetUserScopedRuntimeState()
    await purgePersistedUserState()
  }

  await AsyncStorage.setItem(MOBILE_SESSION_OWNER_STORAGE_KEY, userId).catch(
    () => undefined,
  )
}

/**
 * Clears every user-scoped cache/state boundary after logout or failed session
 * restoration. Authentication secrets are cleared by authService itself.
 */
export async function clearSessionCache() {
  await queryClient.cancelQueries().catch(() => undefined)
  queryClient.clear()
  resetUserScopedRuntimeState()

  await Promise.all([
    purgePersistedUserState(),
    AsyncStorage.removeItem(MOBILE_SESSION_OWNER_STORAGE_KEY).catch(
      () => undefined,
    ),
  ])
}
