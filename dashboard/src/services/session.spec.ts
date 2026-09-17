import { describe, it, expect, beforeEach } from 'vitest'
import { browserSession } from './session'

/**
 * This module is the exact invariant `security-convergence-gate.mjs` asserts
 * by regex (`let accessToken: string | null = null`): the access token lives
 * only in a module-scope variable, never in localStorage/sessionStorage. If
 * this ever grows a second storage path, this suite is where it would break.
 */
describe('browserSession', () => {
  beforeEach(() => {
    browserSession.clear()
  })

  it('starts with no token', () => {
    expect(browserSession.getAccessToken()).toBeNull()
  })

  it('returns the token that was set', () => {
    browserSession.setAccessToken('token-1')
    expect(browserSession.getAccessToken()).toBe('token-1')
  })

  it('overwrites a previous token rather than accumulating state', () => {
    browserSession.setAccessToken('token-1')
    browserSession.setAccessToken('token-2')
    expect(browserSession.getAccessToken()).toBe('token-2')
  })

  it('clear() removes the token', () => {
    browserSession.setAccessToken('token-1')
    browserSession.clear()
    expect(browserSession.getAccessToken()).toBeNull()
  })

  it('accepts an explicit null to clear the token', () => {
    browserSession.setAccessToken('token-1')
    browserSession.setAccessToken(null)
    expect(browserSession.getAccessToken()).toBeNull()
  })

  it('never touches localStorage or sessionStorage', () => {
    browserSession.setAccessToken('token-1')
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})
