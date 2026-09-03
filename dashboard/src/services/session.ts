let accessToken: string | null = null

/**
 * Browser session memory. The long-lived refresh credential lives exclusively
 * in the backend-set HttpOnly cookie; JavaScript only keeps the short-lived
 * access token in memory for the current page lifetime.
 */
export const browserSession = {
  getAccessToken(): string | null {
    return accessToken
  },

  setAccessToken(token: string | null): void {
    accessToken = token
  },

  clear(): void {
    accessToken = null
  },
}
