import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ============================================================
// CONFIGURACIÓN
// ============================================================

/**
 * URL base de la API. Exportada para uso en sockets y otros consumidores
 * (p. ej., useChatStore necesita derivar la URL del WebSocket).
 *
 * En producción, reemplazar por una variable de entorno via react-native-config.
 */
export const API_URL =
  (typeof process !== 'undefined' && process.env?.API_URL) ||
  'http://localhost:3000/api'

const DEFAULT_TIMEOUT_MS = 15000
const UPLOAD_TIMEOUT_MS = 60000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 300
// Status codes que disparan retry (idempotentes o transitorios)
const RETRYABLE_STATUS = [408, 425, 429, 500, 502, 503, 504]

// ============================================================
// HELPERS
// ============================================================

/** UUID v4 ligero para correlacionar requests entre cliente y servidor. */
function genRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Pausa con jitter para distribuir reintentos y evitar thundering herd. */
function backoffDelay(attempt: number): Promise<void> {
  const exp = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
  const jitter = Math.random() * RETRY_BASE_DELAY_MS
  return new Promise((resolve) => setTimeout(resolve, exp + jitter))
}

/** Construye un mensaje user-friendly a partir de un AxiosError. */
export function getErrorMessage(error: unknown): string {
  const err = error as AxiosError<{ message?: string }>
  if (!err?.isAxiosError) return 'Ocurrió un error inesperado'
  if (err.code === 'ECONNABORTED') return 'La solicitud tardó demasiado. Verifica tu conexión.'
  if (!err.response) return 'No hay conexión con el servidor.'
  return (
    err.response.data?.message ||
    `Error ${err.response.status}: ${err.response.statusText || 'Solicitud falló'}`
  )
}

// ============================================================
// CLIENTE HTTP RESILIENTE
// ============================================================

/**
 * Mapa de requests GET en vuelo para deduplicación.
 * Si dos componentes piden el mismo recurso simultáneamente,
 * compartirán la misma promise → 1 sola petición de red.
 */
const inFlightGets = new Map<string, Promise<unknown>>()

/** Promise singleton para refresh de token (evita race conditions). */
let refreshTokenPromise: Promise<string> | null = null

async function performTokenRefresh(): Promise<string> {
  if (refreshTokenPromise) return refreshTokenPromise

  refreshTokenPromise = (async () => {
    try {
      const refreshToken = await AsyncStorage.getItem('refreshToken')
      if (!refreshToken) throw new Error('No refresh token available')

      const response = await axios.post(
        `${API_URL}/auth/refresh`,
        { refreshToken },
        { timeout: DEFAULT_TIMEOUT_MS }
      )

      const { accessToken, refreshToken: newRefreshToken } = response.data
      await AsyncStorage.setItem('accessToken', accessToken)
      if (newRefreshToken) {
        await AsyncStorage.setItem('refreshToken', newRefreshToken)
      }
      return accessToken
    } finally {
      // Permitir nuevos refresh después de que termine este (éxito o falla)
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
      async (config: InternalAxiosRequestConfig) => {
        // 1. JWT auth
        const token = await AsyncStorage.getItem('accessToken')
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`
        }

        // 2. Request ID para correlación de logs
        if (config.headers) {
          config.headers['X-Request-Id'] = genRequestId()
        }

        // 3. Timeout extendido para uploads multipart
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
          | (InternalAxiosRequestConfig & { _retry?: boolean; _retryCount?: number })
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
            await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user'])
            return Promise.reject(refreshError)
          }
        }

        // --- Retry con backoff (errores transitorios) ---
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

  /**
   * GET deduplicado: si la misma URL+params está en vuelo, reutiliza la promise.
   * Útil para evitar tormentas de requests cuando varios componentes
   * piden el mismo recurso al montarse simultáneamente.
   */
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

// Default export para compatibilidad con servicios existentes (`import api from './api'`)
export default apiClient
