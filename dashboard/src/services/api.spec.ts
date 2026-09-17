import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios, { AxiosError } from 'axios'
import { getErrorMessage, performTokenRefresh } from './api'
import { browserSession } from './session'

/**
 * `getErrorMessage` is the only thing standing between a raw axios failure
 * and what an admin sees on screen while trying to approve a transfer.
 * `performTokenRefresh` is the only path that ever mints a new access token,
 * and it must collapse concurrent 401s from parallel requests into one HTTP
 * call rather than a stampede of refreshes.
 */
describe('getErrorMessage', () => {
  it('returns a generic message for a non-axios error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('Ocurrió un error inesperado')
    expect(getErrorMessage('a string')).toBe('Ocurrió un error inesperado')
    expect(getErrorMessage(undefined)).toBe('Ocurrió un error inesperado')
  })

  it('reports a timeout distinctly from a generic network failure', () => {
    const err = { isAxiosError: true, code: 'ECONNABORTED' } as AxiosError
    expect(getErrorMessage(err)).toBe('La solicitud tardó demasiado. Verifica tu conexión.')
  })

  it('reports no connection when there is no response at all', () => {
    const err = { isAxiosError: true, code: 'ERR_NETWORK' } as AxiosError
    expect(getErrorMessage(err)).toBe('No hay conexión con el servidor.')
  })

  it('surfaces the backend message when the server provides one', () => {
    const err = {
      isAxiosError: true,
      response: { status: 409, statusText: 'Conflict', data: { message: 'Ya fue revisada' } },
    } as AxiosError<{ message?: string }>
    expect(getErrorMessage(err)).toBe('Ya fue revisada')
  })

  it('falls back to status + statusText when the backend sends no message', () => {
    const err = {
      isAxiosError: true,
      response: { status: 500, statusText: 'Internal Server Error', data: {} },
    } as AxiosError<{ message?: string }>
    expect(getErrorMessage(err)).toBe('Error 500: Internal Server Error')
  })
})

describe('performTokenRefresh', () => {
  beforeEach(() => {
    browserSession.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts to /auth/refresh with the cookie, not a bearer token', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { accessToken: 'fresh-token' },
    })

    const token = await performTokenRefresh()

    expect(token).toBe('fresh-token')
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      {},
      expect.objectContaining({
        withCredentials: true,
        headers: expect.objectContaining({ 'X-Nvet-Session-Mode': 'cookie' }),
      }),
    )
  })

  it('stores the refreshed token in the in-memory session', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { accessToken: 'fresh-token' } })

    await performTokenRefresh()

    expect(browserSession.getAccessToken()).toBe('fresh-token')
  })

  it('rejects and leaves the session untouched when the backend returns no token', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} })

    await expect(performTokenRefresh()).rejects.toThrow(
      'No access token returned from refresh',
    )
    expect(browserSession.getAccessToken()).toBeNull()
  })

  it('collapses concurrent refreshes into a single HTTP call', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { accessToken: 'fresh-token' },
    })

    const [a, b, c] = await Promise.all([
      performTokenRefresh(),
      performTokenRefresh(),
      performTokenRefresh(),
    ])

    expect(post).toHaveBeenCalledTimes(1)
    expect([a, b, c]).toEqual(['fresh-token', 'fresh-token', 'fresh-token'])
  })

  it('allows a new refresh after the in-flight one settles, success or failure', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ data: { accessToken: 'second-token' } })

    await expect(performTokenRefresh()).rejects.toThrow('network down')
    const token = await performTokenRefresh()

    expect(post).toHaveBeenCalledTimes(2)
    expect(token).toBe('second-token')
  })
})
