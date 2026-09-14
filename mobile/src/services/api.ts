import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios'
import { secureStorage } from '../lib/secureStorage'
import runtimeTelemetry from './runtime-telemetry.service'

// ============================================================
// CONFIGURACIÓN
// ============================================================

/**
 * URL base de la API, inyectada durante el bundle por Babel.
 *
 * - Desarrollo/test sin NVET_API_URL: localhost.
 * - Android release: Gradle exige NVET_API_URL HTTPS antes de generar el AAB.
 * - Staging/E2E: el workflow inyecta la URL del entorno correspondiente.
 */
export const API_URL = '__NVET_API_URL__'

const DEFAULT_TIMEOUT_MS = 15000
const UPLOAD_TIMEOUT_MS = 60000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 300
const RETRYABLE_STATUS = [408, 425, 429, 500, 502, 503, 504]
const TELEMETRY_PATH = '/operations/runtime-telemetry/events'

type TelemetryRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
  _retryCount?: number
  _telemetryStartedAt?: number
}

// ============================================================
// HELPERS
// ============================================================

function genRequestId(): string {
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

function requestDuration(config?: TelemetryRequestConfig): number | undefined {
  return config?._telemetryStartedAt !== undefined
    ? Math.max(0, Date.now() - config._telemetryStartedAt)
    : undefined
}

function isTelemetryRequest(config?: TelemetryRequestConfig): boolean {
  return typeof config?.url === 'string' && config.url.includes(TELEMETRY_PATH)
}

function outcomeCodeForError(error: AxiosError): string {
  if (error.code === 'ECONNABORTED') return 'TIMEOUT'
  if (!error.response) return 'NETWORK_ERROR'
  return `HTTP_${error.response.status}`
}

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

const inFlightGets = new Map<string, Promise<unknown>>()
let refreshTokenPromise: Promise<string> | null = null

async function performTokenRefresh(): Promise<string> {
  if (refreshTokenPromise) return refreshTokenPromise

  refreshTokenPromise = (async () => {
    const startedAt = Date.now()
    try {
      const refreshToken = await secureStorage.getRefreshToken()
      if (!refreshToken) throw new Error('No refresh token available')

      const response = await axios.post(
        `${API_URL}/auth/refresh`,
        { refreshToken },
        { timeout: DEFAULT_TIMEOUT_MS },
      )

      const { accessToken, refreshToken: newRefreshToken } = response.data
      if (!accessToken || !newRefreshToken) {
        throw new Error('Server did not return a complete rotated session')
      }

      await secureStorage.setTokens({
        accessToken,
        refreshToken: newRefreshToken,
      })
      runtimeTelemetry.emit('SESSION_REFRESH_SUCCESS', {
        durationMs: Date.now() - startedAt,
      })
      return accessToken
    } catch (error) {
      runtimeTelemetry.emit('SESSION_REFRESH_FAILURE', {
        durationMs: Date.now() - startedAt,
        outcomeCode:
          error instanceof AxiosError ? outcomeCodeForError(error) : 'REFRESH_FAILED',
      })
      throw error
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
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const telemetryConfig = config as TelemetryRequestConfig
        telemetryConfig._telemetryStartedAt ??= Date.now()

        const token = await secureStorage.getAccessToken()
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
      (error) => Promise.reject(error),
    )

    this.client.interceptors.response.use(
      (response) => {
        const config = response.config as TelemetryRequestConfig
        if (!isTelemetryRequest(config)) {
          runtimeTelemetry.emit('API_REQUEST_SUCCESS', {
            durationMs: requestDuration(config),
          })
        }
        return response
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as TelemetryRequestConfig | undefined

        if (!originalRequest) return Promise.reject(error)

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true
          try {
            const newAccessToken = await performTokenRefresh()
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
            }
            return this.client(originalRequest)
          } catch (refreshError) {
            await secureStorage.clearTokens().catch(() => undefined)
            if (!isTelemetryRequest(originalRequest)) {
              runtimeTelemetry.emit('API_REQUEST_FAILURE', {
                durationMs: requestDuration(originalRequest),
                outcomeCode: 'SESSION_REFRESH_FAILED',
              })
            }
            return Promise.reject(refreshError)
          }
        }

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

        if (!isTelemetryRequest(originalRequest)) {
          runtimeTelemetry.emit('API_REQUEST_FAILURE', {
            durationMs: requestDuration(originalRequest),
            outcomeCode: outcomeCodeForError(error),
          })
        }
        return Promise.reject(error)
      },
    )
  }

  public getClient(): AxiosInstance {
    return this.client
  }

  public async dedupedGet<T = unknown>(
    url: string,
    params?: Record<string, unknown>,
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
