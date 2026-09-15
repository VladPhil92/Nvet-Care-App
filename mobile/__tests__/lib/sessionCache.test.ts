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
  return {
    queryClient: {
      cancelQueries: jest.fn(async () => undefined),
      clear: jest.fn(),
      getQueryCache: () => ({ clear: queryCacheClear }),
      setQueryData: jest.fn(),
      __queryCacheClear: queryCacheClear,
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

const queryCacheClear = (queryClient as unknown as { __queryCacheClear: jest.Mock })
  .__queryCacheClear

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
})
