const mockStorage: Record<string, string> = {}

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockStorage[key] = value
  }),
  removeItem: jest.fn(async (key: string) => {
    delete mockStorage[key]
  }),
}))

jest.mock('../../src/lib/queryClient', () => {
  const removeQueries = jest.fn()
  const mutationCacheRemove = jest.fn()
  let mutations: unknown[] = []
  return {
    queryClient: {
      cancelQueries: jest.fn(async () => undefined),
      clear: jest.fn(),
      getQueryCache: () => ({ clear: jest.fn() }),
      removeQueries,
      getMutationCache: () => ({ getAll: () => mutations, remove: mutationCacheRemove }),
      setQueryData: jest.fn(),
      __removeQueries: removeQueries,
      __mutationCacheRemove: mutationCacheRemove,
      __setMutations: (next: unknown[]) => {
        mutations = next
      },
    },
  }
})

jest.mock('../../src/stores/useChatStore', () => ({
  useChatStore: {
    getState: () => ({ disconnectSocket: jest.fn(), clearMessages: jest.fn() }),
    setState: jest.fn(),
  },
}))

jest.mock('../../src/stores/useAppointmentStore', () => ({
  useAppointmentStore: { setState: jest.fn() },
}))

jest.mock('../../src/stores/useWalletStore', () => ({
  useWalletStore: { setState: jest.fn() },
}))

import { adoptSessionCacheOwner, clearSessionCache } from '../../src/lib/sessionCache'
import { queryClient } from '../../src/lib/queryClient'
import { qk } from '../../src/lib/queryKeys'

const queryClientMock = queryClient as unknown as {
  __removeQueries: jest.Mock
  __mutationCacheRemove: jest.Mock
  __setMutations: (next: unknown[]) => void
}
const removeQueries = queryClientMock.__removeQueries
const mutationCacheRemove = queryClientMock.__mutationCacheRemove

/**
 * Regression test for the mobile login regression (surfaced twice: first via
 * queryClient.clear() orphaning the in-flight login mutation, then via
 * queryClient.getQueryCache().clear() orphaning RootNavigator's own
 * useCurrentUserQuery() observer — see sessionCache.integration.test.ts for
 * the real-QueryClient reproduction of the second one). adoptSessionCacheOwner
 * and clearSessionCache run synchronously inside the login/register/logout
 * mutation's own mutationFn, while an 'auth','me' QueryObserver is already
 * mounted. Neither queryClient.clear() nor queryCache.clear() may be called
 * here; only non-'auth' queries and non-'auth' mutations may be purged.
 */
describe('sessionCache', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
    ;(queryClient.clear as jest.Mock).mockClear()
    ;(queryClient.setQueryData as jest.Mock).mockClear()
    removeQueries.mockClear()
    mutationCacheRemove.mockClear()
    queryClientMock.__setMutations([])
  })

  it('adoptSessionCacheOwner removes only non-auth queries for a new owner', async () => {
    await adoptSessionCacheOwner('user-1')

    expect(removeQueries).toHaveBeenCalledTimes(1)
    const predicate = removeQueries.mock.calls[0][0].predicate
    expect(predicate({ queryKey: ['auth', 'me'] })).toBe(false)
    expect(predicate({ queryKey: ['vets', 'search'] })).toBe(true)
    expect(queryClient.clear).not.toHaveBeenCalled()
  })

  it('adoptSessionCacheOwner is a no-op for the already-adopted owner', async () => {
    await adoptSessionCacheOwner('user-1')
    removeQueries.mockClear()

    await adoptSessionCacheOwner('user-1')

    expect(removeQueries).not.toHaveBeenCalled()
    expect(queryClient.clear).not.toHaveBeenCalled()
  })

  it('clearSessionCache removes only non-auth queries', async () => {
    await clearSessionCache()

    expect(removeQueries).toHaveBeenCalledTimes(1)
    const predicate = removeQueries.mock.calls[0][0].predicate
    expect(predicate({ queryKey: ['auth', 'me'] })).toBe(false)
    expect(predicate({ queryKey: ['appointments', 'list'] })).toBe(true)
    expect(queryClient.clear).not.toHaveBeenCalled()
  })

  it('adoptSessionCacheOwner purges a previous user\'s paused mutations but keeps the in-flight auth one', async () => {
    const authMutation = { options: { mutationKey: ['auth', 'login'] } }
    const bookingMutation = { options: { mutationKey: ['appointments', 'book'] } }
    const keylessMutation = { options: {} }
    queryClientMock.__setMutations([authMutation, bookingMutation, keylessMutation])

    await adoptSessionCacheOwner('user-1')

    expect(mutationCacheRemove).toHaveBeenCalledWith(bookingMutation)
    expect(mutationCacheRemove).toHaveBeenCalledWith(keylessMutation)
    expect(mutationCacheRemove).not.toHaveBeenCalledWith(authMutation)
  })

  it('clearSessionCache purges every non-auth mutation on logout', async () => {
    const authMutation = { options: { mutationKey: ['auth', 'logout'] } }
    const bookingMutation = { options: { mutationKey: ['appointments', 'book'] } }
    queryClientMock.__setMutations([authMutation, bookingMutation])

    await clearSessionCache()

    expect(mutationCacheRemove).toHaveBeenCalledWith(bookingMutation)
    expect(mutationCacheRemove).not.toHaveBeenCalledWith(authMutation)
  })

  /**
   * P1 regression (Codex review on #260): authService.logoutAllDevices(),
   * changePassword() and deleteAccount() call clearSessionCache() directly,
   * with no mutation onSuccess to clear the cache afterward the way
   * useLogoutMutation does. qk.auth.me() has staleTime: Infinity, so without
   * explicitly nulling it here, RootNavigator's useCurrentUserQuery() would
   * keep serving the stale cached user and treat the device as still signed
   * in after those flows revoke the session server-side.
   */
  it('clearSessionCache writes null to the auth.me query through its observer', async () => {
    await clearSessionCache()

    expect(queryClient.setQueryData).toHaveBeenCalledWith(qk.auth.me(), null)
  })

  it('adoptSessionCacheOwner never writes to the auth.me query itself', async () => {
    await adoptSessionCacheOwner('user-1')

    expect(queryClient.setQueryData).not.toHaveBeenCalled()
  })
})
