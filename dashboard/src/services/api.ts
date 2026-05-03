import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'

// ============================================================
// CONFIGURACIÓN
// ============================================================

export const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const DEFAULT_TIMEOUT_MS = 15000
const UPLOAD_TIMEOUT_MS = 60000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 300
const RETRYABLE_STATUS = [408, 425, 429, 500, 502, 503, 504]

// ============================================================
// HELPERS
// ============================================================

function genRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto & { randomUUID: () => string }).randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function backoffDelay(attempt: number): Promise<void> {
  const exp = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
  const jitter = Math.random() * RETRY_BASE_DELAY_MS
  return new Promise((resolve) => setTimeout(resolve, exp + jitter))
}

export function getErrorMessage(error: unknown): string {
  const err = error as AxiosError<{ message?: string }>
  if (!err?.isAxiosError) return 'Ocurrió un error inesperado'
  if (err.code === 'ECONNABORTED')
    return 'La solicitud tardó demasiado. Verifica tu conexión.'
  if (!err.response) return 'No hay conexión con el servidor.'
  return (
    err.response.data?.message ||
    `Error ${err.response.status}: ${err.response.statusText || 'Solicitud falló'}`
  )
}

// ============================================================
// CLIENTE HTTP RESILIENTE
// ============================================================

const inFlightGets = new Map<string, Promise<unknown>>()
let refreshTokenPromise: Promise<string> | null = null

async function performTokenRefresh(): Promise<string> {
  if (refreshTokenPromise) return refreshTokenPromise

  refreshTokenPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) throw new Error('No refresh token available')

      const response = await axios.post(
        `${API_URL}/auth/refresh`,
        { refreshToken },
        { timeout: DEFAULT_TIMEOUT_MS }
      )

      const { accessToken, refreshToken: newRefreshToken } = response.data
      localStorage.setItem('accessToken', accessToken)
      if (newRefreshToken) {
        localStorage.setItem('refreshToken', newRefreshToken)
      }
      return accessToken
    } finally {
      refreshTokenPromise = null
    }
  })()

  return refreshTokenPromise
}

class ApiClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.setupInterceptors()
  }

  private setupInterceptors() {
    // ---------- REQUEST ----------
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('accessToken')
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`
        }

        if (config.headers) {
          config.headers['X-Request-Id'] = genRequestId()
        }

        const isUpload =
          typeof config.headers?.['Content-Type'] === 'string' &&
          config.headers['Content-Type'].includes('multipart/form-data')
        if (isUpload) {
          config.timeout = UPLOAD_TIMEOUT_MS
        }

        return config
      },
      (error) => Promise.reject(error)
    )

    // ---------- RESPONSE ----------
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as
          | (InternalAxiosRequestConfig & {
              _retry?: boolean
              _retryCount?: number
            })
          | undefined

        if (!originalRequest) return Promise.reject(error)

        // --- Auth refresh (401) ---
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true
          try {
            const newAccessToken = await performTokenRefresh()
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
            }
            return this.client(originalRequest)
          } catch (refreshError) {
            localStorage.removeItem('accessToken')
            localStorage.removeItem('refreshToken')
            // No redirigir desde el cliente HTTP; dejar que la app maneje el estado.
            // (los componentes consumirán useAuthStore.isAuthenticated)
            return Promise.reject(refreshError)
          }
        }

        // --- Retry con backoff (errores transitorios, solo GET) ---
        const status = error.response?.status
        const isRetryable =
          (originalRequest.method === 'get' || originalRequest.method === 'GET') &&
          (error.code === 'ECONNABORTED' ||
            !error.response ||
            (status !== undefined && RETRYABLE_STATUS.includes(status)))

        if (isRetryable) {
          originalRequest._retryCount = (originalRequest._retryCount || 0) + 1
          if (originalRequest._retryCount <= MAX_RETRIES) {
            await backoffDelay(originalRequest._retryCount - 1)
            return this.client(originalRequest)
          }
        }

        return Promise.reject(error)
      }
    )
  }

  public getClient(): AxiosInstance {
    return this.client
  }

  public async dedupedGet<T = unknown>(
    url: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const key = `${url}?${JSON.stringify(params || {})}`
    const existing = inFlightGets.get(key)
    if (existing) return existing as Promise<T>

    const promise = this.client
      .get<T>(url, { params })
      .then((res) => res.data)
      .finally(() => {
        inFlightGets.delete(key)
      })

    inFlightGets.set(key, promise)
    return promise
  }
}

const apiClientInstance = new ApiClient()
export const apiClient = apiClientInstance.getClient()
export const dedupedGet = apiClientInstance.dedupedGet.bind(apiClientInstance)
export default apiClient
