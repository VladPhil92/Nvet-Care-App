import { secureStorage } from '../lib/secureStorage'

const API_URL = '__NVET_API_URL__'
const ENDPOINT = `${API_URL}/operations/runtime-telemetry/events`
const MAX_QUEUE_SIZE = 100
const MAX_DURATION_MS = 600_000

export const RUNTIME_TELEMETRY_EVENTS = [
  'APP_STARTED',
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILURE',
  'SESSION_REFRESH_SUCCESS',
  'SESSION_REFRESH_FAILURE',
  'CTG_FEDERATION_STARTED',
  'CTG_FEDERATION_CALLBACK_RECEIVED',
  'CTG_FEDERATION_EXCHANGE_SUCCESS',
  'CTG_FEDERATION_EXCHANGE_FAILURE',
  'API_REQUEST_SUCCESS',
  'API_REQUEST_FAILURE',
  'UNHANDLED_JS_ERROR',
] as const

export type RuntimeTelemetryEventName = (typeof RUNTIME_TELEMETRY_EVENTS)[number]

type RuntimeTelemetryEvent = {
  event: RuntimeTelemetryEventName
  durationMs?: number
  outcomeCode?: string
}

const queue: RuntimeTelemetryEvent[] = []
let flushPromise: Promise<void> | null = null

function sanitizeDuration(value?: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(MAX_DURATION_MS, Math.round(value)))
}

function sanitizeOutcomeCode(value?: string): string | undefined {
  if (!value) return undefined
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9_:+-]/g, '_')
    .slice(0, 64)
  return normalized || undefined
}

function enqueue(event: RuntimeTelemetryEvent) {
  queue.push(event)
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.splice(0, queue.length - MAX_QUEUE_SIZE)
  }
}

async function send(event: RuntimeTelemetryEvent, accessToken: string): Promise<'sent' | 'drop' | 'retry'> {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(event),
    })

    if (response.ok) return 'sent'
    if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 429) {
      return 'drop'
    }
    return 'retry'
  } catch {
    return 'retry'
  }
}

class RuntimeTelemetryService {
  emit(
    event: RuntimeTelemetryEventName,
    input: { durationMs?: number; outcomeCode?: string } = {},
  ): void {
    enqueue({
      event,
      ...(sanitizeDuration(input.durationMs) !== undefined
        ? { durationMs: sanitizeDuration(input.durationMs) }
        : {}),
      ...(sanitizeOutcomeCode(input.outcomeCode)
        ? { outcomeCode: sanitizeOutcomeCode(input.outcomeCode) }
        : {}),
    })
    void this.flush()
  }

  async flush(): Promise<void> {
    if (flushPromise) return flushPromise

    flushPromise = (async () => {
      const accessToken = await secureStorage.getAccessToken().catch(() => null)
      if (!accessToken) return

      while (queue.length > 0) {
        const next = queue[0]
        const result = await send(next, accessToken)
        if (result === 'retry') return
        queue.shift()
      }
    })().finally(() => {
      flushPromise = null
    })

    return flushPromise
  }

  pendingCount(): number {
    return queue.length
  }
}

export const runtimeTelemetry = new RuntimeTelemetryService()
export default runtimeTelemetry
