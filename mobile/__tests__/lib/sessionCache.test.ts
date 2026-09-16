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
  const queryCacheClear = jest.fn()
  const mutationCacheRemove = jest.fn()
  let mutations: unknown[] = []
  return {
    queryClient: {
      cancelQueries: jest.fn(async () => undefined),
      clear: jest.fn(),
      getQueryCache: () => ({ clear: queryCacheClear }),
      getMutationCache: () => ({ getAll: () => mutations, remove: mutationCacheRemove }),
      setQueryData: jest.fn(),
      __queryCacheClear: queryCacheClear,
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

const queryClientMock = queryClient as unknown as {
  __queryCacheClear: jest.Mock
  __mutationCacheRemove: jest.Mock
  __setMutations: (next: unknown[]) => void
}
const queryCacheClear = queryClientMock.__queryCacheClear
const mutationCacheRemove = queryClientMock.__mutationCacheRemove

/**
 * Regression test for the Phase 46 mobile login regression: adopting/clearing
 * the session cache runs synchronously inside the login/register/logout
 * mutation's own mutationFn (authService.persistSession / clearSession). Using
 * the nuclear queryClient.clear() there wipes the mutation cache mid-flight,
 * orphaning that very mutation's observer so its onSuccess (and the UI
 * transition after a successful login) never fires. Only the query cache may
 * be cleared here.
 */
describe('sessionCache', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
    ;(queryClient.clear as jest.Mock).mockClear()
    queryCacheClear.mockClear()
    mutationCacheRemove.mockClear()
    queryClientMock.__setMutations([])
  })

  it('adoptSessionCacheOwner never wipes the mutation cache for a new owner', async () => {
    await adoptSessionCacheOwner('user-1')

    expect(queryCacheClear).toHaveBeenCalledTimes(1)
    expect(queryClient.clear).not.toHaveBeenCalled()
  })

  it('adoptSessionCacheOwner is a no-op for the already-adopted owner', async () => {
    await adoptSessionCacheOwner('user-1')
    queryCacheClear.mockClear()

    await adoptSessionCacheOwner('user-1')

    expect(queryCacheClear).not.toHaveBeenCalled()
    expect(queryClient.clear).not.toHaveBeenCalled()
  })

  it('clearSessionCache never wipes the mutation cache', async () => {
    await clearSessionCache()

    expect(queryCacheClear).toHaveBeenCalledTimes(1)
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
})
