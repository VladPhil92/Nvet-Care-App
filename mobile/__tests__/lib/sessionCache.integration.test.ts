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

// A bare, real QueryClient — no NetInfo/AppState listeners like the app's own
// mobile/src/lib/queryClient.ts, which would leave open handles in Jest. The
// bug this test catches lives entirely in the cache/observer wiring, which a
// plain QueryClient reproduces identically.
jest.mock('../../src/lib/queryClient', () => {
  const { QueryClient } = require('@tanstack/react-query')
  return {
    // gcTime: 0 avoids leaving a pending garbage-collection setTimeout behind
    // after each test unsubscribes its observer, which otherwise keeps the
    // Jest process alive.
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
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

import { QueryObserver } from '@tanstack/react-query'
import { queryClient } from '../../src/lib/queryClient'
import { qk } from '../../src/lib/queryKeys'
import { adoptAuthenticatedUser, clearSessionCache } from '../../src/lib/sessionCache'

/**
 * Integration regression test using a REAL @tanstack/react-query QueryClient
 * (no mocking of getQueryCache/getMutationCache/removeQueries). This is the
 * test that should have caught the actual production bug: adoptSessionCacheOwner
 * originally called queryClient.getQueryCache().clear(), which — verified here
 * against the real library — detaches any QueryObserver already mounted on a
 * query key (exactly what RootNavigator's useCurrentUserQuery() is doing on
 * 'auth','me' at the moment a login mutation calls adoptAuthenticatedUser).
 * setQueryData() called afterward writes to a fresh, unobserved query and
 * never reaches that mounted observer, so the app never leaves the login
 * screen. A test that mocks the queryClient module cannot catch this because
 * it never exercises the real cache/observer wiring.
 */
describe('sessionCache (real QueryClient integration)', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
    queryClient.clear()
  })

  it('an already-mounted useCurrentUserQuery-style observer sees the new user after login', async () => {
    const observer = new QueryObserver(queryClient, {
      queryKey: qk.auth.me(),
      queryFn: async () => null,
      staleTime: Infinity,
    })
    const results: unknown[] = []
    const unsubscribe = observer.subscribe((result) => {
      results.push(result.data)
    })

    // Let the initial (unauthenticated) fetch settle, as RootNavigator would
    // observe before the user submits the login form.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(observer.getCurrentResult().data).toBeNull()

    const user = { id: 'user-1', role: 'CLIENT' }
    await adoptAuthenticatedUser(user)

    expect(observer.getCurrentResult().data).toEqual(user)
    expect(results[results.length - 1]).toEqual(user)

    unsubscribe()
  })

  it('purges a previous user\'s other cached queries without touching the auth query observer', async () => {
    queryClient.setQueryData(['vets', 'search', {}], [{ id: 'vet-1' }])

    const observer = new QueryObserver(queryClient, {
      queryKey: qk.auth.me(),
      queryFn: async () => null,
      staleTime: Infinity,
    })
    const unsubscribe = observer.subscribe(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))

    await adoptAuthenticatedUser({ id: 'user-1', role: 'CLIENT' })

    expect(queryClient.getQueryData(['vets', 'search', {}])).toBeUndefined()
    expect(observer.getCurrentResult().data).toEqual({ id: 'user-1', role: 'CLIENT' })

    unsubscribe()
  })

  /**
   * P1 regression (Codex review on #260): authService.logoutAllDevices(),
   * changePassword() and deleteAccount() call clearSessionCache() directly —
   * unlike useLogoutMutation, none of them run a queryClient.clear() of their
   * own afterward. qk.auth.me() has staleTime: Infinity, so without
   * clearSessionCache() itself writing null through the still-attached
   * observer, RootNavigator would keep reporting the old cached user as
   * still signed in after those flows revoke the session server-side.
   */
  it('clearSessionCache does not detach the auth query observer, and itself writes null through it', async () => {
    await adoptAuthenticatedUser({ id: 'user-1', role: 'CLIENT' })

    const observer = new QueryObserver(queryClient, {
      queryKey: qk.auth.me(),
      queryFn: async () => null,
      staleTime: Infinity,
    })
    const results: unknown[] = []
    const unsubscribe = observer.subscribe((result) => {
      results.push(result.data)
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(observer.getCurrentResult().data).toEqual({ id: 'user-1', role: 'CLIENT' })

    await clearSessionCache()

    expect(observer.getCurrentResult().data).toBeNull()
    expect(results[results.length - 1]).toBeNull()

    unsubscribe()
  })
})
