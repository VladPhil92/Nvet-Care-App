/**
 * k6 load test scenarios para Nvet Care backend.
 *
 * 4 perfiles de carga predefinidos:
 *
 *   smoke    → 1 VU x 30s    (validación de infra)
 *   baseline → 50 VU x 5min  (carga típica de producción)
 *   stress   → ramp 0→200 x 10min + sostener (encuentra el quiebre)
 *   spike    → 0→400 en 30s + sostener 1min (simula viral / promo)
 *
 * Uso:
 *   k6 run --env BASE_URL=http://localhost:3000 --env PROFILE=smoke   k6-scenarios.js
 *   k6 run --env BASE_URL=https://api.staging.nvetcare.co --env PROFILE=baseline k6-scenarios.js
 *   k6 run --env PROFILE=stress  k6-scenarios.js
 *   k6 run --env PROFILE=spike   k6-scenarios.js
 *
 * Variables de entorno:
 *   BASE_URL                URL del API (default http://localhost:3000)
 *   PROFILE                 smoke | baseline | stress | spike (default smoke)
 *   AUTH_EMAIL/AUTH_PASSWORD credenciales del seed para login
 *
 * Thresholds:
 *   - http_req_duration p95 < 500ms (todos los endpoints)
 *   - http_req_duration p99 < 1500ms
 *   - http_req_failed rate < 0.5%
 *   - errors rate < 1%
 */

import http from 'k6/http'
import { check, sleep, group } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'

// ── Métricas custom ────────────────────────────────────────────────
const errors = new Rate('errors')
const bookSuccess = new Counter('book_success')
const paymentSuccess = new Counter('payment_success')
const searchLatency = new Trend('search_latency_ms', true)
const bookLatency = new Trend('book_latency_ms', true)

// ── Profiles ───────────────────────────────────────────────────────
const PROFILES = {
  smoke: {
    vus: 1,
    duration: '30s',
  },
  baseline: {
    stages: [
      { duration: '1m', target: 50 }, // ramp-up
      { duration: '5m', target: 50 }, // sostenido
      { duration: '1m', target: 0 }, // ramp-down
    ],
  },
  stress: {
    stages: [
      { duration: '2m', target: 50 },
      { duration: '3m', target: 100 },
      { duration: '3m', target: 200 },
      { duration: '5m', target: 200 }, // sostener al máximo
      { duration: '2m', target: 0 },
    ],
  },
  spike: {
    stages: [
      { duration: '30s', target: 400 }, // spike instantáneo
      { duration: '1m', target: 400 }, // sostener
      { duration: '30s', target: 0 },
    ],
  },
}

const profile = (__ENV.PROFILE || 'smoke').toLowerCase()
if (!PROFILES[profile]) {
  throw new Error(`PROFILE inválido: "${profile}". Opciones: ${Object.keys(PROFILES).join(', ')}`)
}

export const options = {
  ...PROFILES[profile],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.005'],
    errors: ['rate<0.01'],
    search_latency_ms: ['p(95)<300'],
    book_latency_ms: ['p(95)<800'],
  },
  // Tags para análisis cross-runs en Grafana / k6 cloud
  tags: {
    profile,
    project: 'nvet-care',
  },
  // No fallar el script si un threshold se rompe (queremos ver todos los datos)
  noConnectionReuse: false,
  userAgent: 'k6-loadtest/nvet-care',
}

// ── Constantes ─────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'
const AUTH_EMAIL = __ENV.AUTH_EMAIL || 'cliente@nvetcare.test'
const AUTH_PASSWORD = __ENV.AUTH_PASSWORD || 'TestClient123!'

const SPECIALTIES = [
  'Medicina general',
  'Vacunación',
  'Cirugía menor',
  'Dermatología',
  'Cardiología',
]

// ── Setup global: login una vez por VU ─────────────────────────────
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: AUTH_EMAIL, password: AUTH_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  check(loginRes, {
    'setup: login 200': (r) => r.status === 200,
  })
  if (loginRes.status !== 200) {
    throw new Error(`Setup login failed: ${loginRes.status} ${loginRes.body}`)
  }
  const body = loginRes.json()
  return { token: body.accessToken }
}

// ── User journey ───────────────────────────────────────────────────
export default function (data) {
  const headers = {
    Authorization: `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  }

  // 70% del traffic: search vets (lectura, alta frecuencia)
  // 20% del traffic: ver detalle (mid frequency)
  // 10% del traffic: book + pay (escritura, baja frecuencia)
  const action = pickWeighted([
    { value: 'search', weight: 70 },
    { value: 'detail', weight: 20 },
    { value: 'book', weight: 10 },
  ])

  if (action === 'search') {
    group('search', () => {
      const start = Date.now()
      const specialty = randomItem(SPECIALTIES)
      const res = http.get(
        `${BASE_URL}/vets/search?specialty=${encodeURIComponent(specialty)}&limit=20`,
        { headers, tags: { endpoint: 'search' } },
      )
      searchLatency.add(Date.now() - start)
      const ok = check(res, {
        'search 200': (r) => r.status === 200,
        'search has items': (r) => {
          try {
            const body = r.json()
            return Array.isArray(body.items) || Array.isArray(body)
          } catch {
            return false
          }
        },
      })
      errors.add(!ok)
    })
  } else if (action === 'detail') {
    group('vet detail', () => {
      // Asumimos que existe al menos vet_001 en seed
      const vetId = randomItem(['vet_001', 'vet_002', 'vet_003'])
      const res = http.get(`${BASE_URL}/vets/${vetId}`, {
        headers,
        tags: { endpoint: 'detail' },
      })
      const ok = check(res, {
        'detail 200': (r) => r.status === 200 || r.status === 404,
      })
      errors.add(!ok)

      // Sub-request: schedule
      const schedRes = http.get(`${BASE_URL}/vets/${vetId}/schedule`, {
        headers,
        tags: { endpoint: 'detail-schedule' },
      })
      check(schedRes, { 'schedule 200/404': (r) => [200, 404].includes(r.status) })
    })
  } else if (action === 'book') {
    group('book + pay', () => {
      const start = Date.now()
      const idempotencyKey = `lt-${__VU}-${__ITER}-${Date.now()}`

      const bookPayload = {
        vetId: 'vet_001',
        petId: 'pet_001',
        serviceType: 'GENERAL_CONSULTATION',
        scheduledAt: new Date(Date.now() + randomIntBetween(1, 7) * 86400000).toISOString(),
        address: 'Calle 100 # 8-50, Bogotá',
        amountCop: 80000,
        amountCtg: 80,
      }

      const bookRes = http.post(`${BASE_URL}/appointments`, JSON.stringify(bookPayload), {
        headers: { ...headers, 'Idempotency-Key': idempotencyKey },
        tags: { endpoint: 'book' },
      })
      bookLatency.add(Date.now() - start)
      const bookOk = check(bookRes, {
        'book 201': (r) => r.status === 201,
      })
      errors.add(!bookOk)
      if (bookOk) bookSuccess.add(1)

      if (bookOk) {
        const apptId = bookRes.json('id')
        const payRes = http.post(
          `${BASE_URL}/payments/process`,
          JSON.stringify({
            appointmentId: apptId,
            method: 'CTG',
            amountCop: 80000,
            amountCtg: 80,
          }),
          {
            headers: { ...headers, 'Idempotency-Key': idempotencyKey },
            tags: { endpoint: 'pay' },
          },
        )
        const payOk = check(payRes, {
          'pay 200': (r) => r.status === 200 || r.status === 201,
        })
        errors.add(!payOk)
        if (payOk) paymentSuccess.add(1)
      }
    })
  }

  // think time variable: 1-3s (realista para usuarios mobile)
  sleep(randomIntBetween(1, 3))
}

// ── Helpers ────────────────────────────────────────────────────────
function pickWeighted(items) {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item.value
  }
  return items[items.length - 1].value
}

// ── Teardown ───────────────────────────────────────────────────────
export function teardown(data) {
  // No-op, pero podemos limpiar tokens si fueran emitidos por VU
  console.log('Teardown done.')
}

// ── Reporte custom (resumen al final) ──────────────────────────────
export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    'k6-summary.json': JSON.stringify(data, null, 2),
  }
}

function textSummary(data) {
  const m = data.metrics
  const lines = [
    '',
    '┌─────────────────────────────────────────────────────────────┐',
    `│ Profile: ${profile.padEnd(48)} │`,
    `│ Base URL: ${BASE_URL.slice(0, 48).padEnd(48)} │`,
    '├─────────────────────────────────────────────────────────────┤',
    `│ Iterations:        ${String(m.iterations?.values.count ?? 0).padStart(10)}              │`,
    `│ HTTP requests:     ${String(m.http_reqs?.values.count ?? 0).padStart(10)}              │`,
    `│ Failure rate:      ${pctOrDash(m.http_req_failed)}              │`,
    `│ Latency p50:       ${msOrDash(m.http_req_duration?.values['p(50)'])}              │`,
    `│ Latency p95:       ${msOrDash(m.http_req_duration?.values['p(95)'])}              │`,
    `│ Latency p99:       ${msOrDash(m.http_req_duration?.values['p(99)'])}              │`,
    `│ Books succeeded:   ${String(m.book_success?.values.count ?? 0).padStart(10)}              │`,
    `│ Payments succeeded:${String(m.payment_success?.values.count ?? 0).padStart(10)}              │`,
    '└─────────────────────────────────────────────────────────────┘',
    '',
  ]
  return lines.join('\n')
}

function msOrDash(v) {
  return v == null ? '   --   ' : `${v.toFixed(1).padStart(7)}ms`
}
function pctOrDash(metric) {
  if (!metric) return '  --  '
  return `${(metric.values.rate * 100).toFixed(2).padStart(5)}%`
}
