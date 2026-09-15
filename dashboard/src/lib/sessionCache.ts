import { queryClient } from './queryClient'
import { useAdminStore } from '../stores/useAdminStore'

export const DASHBOARD_QUERY_CACHE_STORAGE_KEY = 'nvet-care-query-cache'
export const DASHBOARD_SESSION_OWNER_STORAGE_KEY = 'nvet-care-dashboard-session-owner-v1'

function getStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function resetUserScopedRuntimeState() {
  useAdminStore.setState({
    metrics: null,
    transactions: [],
    appointments: [],
    transferTracking: [],
    paymentStats: [],
    isLoadingMetrics: false,
    isLoadingTransactions: false,
    isLoadingAppointments: false,
    isLoadingTransfers: false,
    isLoadingPaymentStats: false,
    error: null,
  })
}

function purgePersistedUserState(storage: Storage | null) {
  try {
    storage?.removeItem(DASHBOARD_QUERY_CACHE_STORAGE_KEY)
  } catch {
    // Runtime state is still cleared below even if browser storage is blocked.
  }
}

/**
 * Makes the browser query cache explicitly owned by one authenticated Nvet
 * user. Missing ownership metadata is treated as legacy/untrusted cache.
 */
export async function adoptSessionCacheOwner(userId: string) {
  const storage = getStorage()
  let currentOwner: string | null = null

  try {
    currentOwner = storage?.getItem(DASHBOARD_SESSION_OWNER_STORAGE_KEY) ?? null
  } catch {
    currentOwner = null
  }

  if (currentOwner !== userId) {
    await queryClient.cancelQueries().catch(() => undefined)
    queryClient.clear()
    resetUserScopedRuntimeState()
    purgePersistedUserState(storage)
  }

  try {
    storage?.setItem(DASHBOARD_SESSION_OWNER_STORAGE_KEY, userId)
  } catch {
    // An unavailable localStorage must not make login fail.
  }
}

export async function clearSessionCache() {
  const storage = getStorage()

  await queryClient.cancelQueries().catch(() => undefined)
  queryClient.clear()
  resetUserScopedRuntimeState()
  purgePersistedUserState(storage)

  try {
    storage?.removeItem(DASHBOARD_SESSION_OWNER_STORAGE_KEY)
  } catch {
    // Best-effort persistent cleanup; in-memory data is already gone.
  }
}
