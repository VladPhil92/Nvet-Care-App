/**
 * MSW (Mock Service Worker) handlers para tests jest.
 *
 * Cada handler imita el contrato del backend NestJS sin necesidad
 * de levantar el servidor real. Permite tests deterministas de
 * los hooks de React Query y de los services.
 *
 * Uso:
 *   import { server } from './mocks/server'
 *   server.use(rest.get('/vets', () => HttpResponse.json([])))  // override por test
 *
 * Convenciones:
 *   - El base path es relativo (sin host) para que funcione con cualquier API_URL
 *   - Latencia simulada con `delay(50)` solo cuando el test lo necesita explícito
 *   - Las respuestas siguen el shape exacto del backend (ver dto/* del NestJS)
 */

import { http, HttpResponse, delay } from 'msw'

// ── Fixtures compartidos ─────────────────────────────────────────
export const FIXTURES = {
  user: {
    id: 'usr_001',
    email: 'cliente@nvetcare.test',
    firstName: 'Carlos',
    lastName: 'Mendoza',
    phone: '+573001234567',
    role: 'CLIENT' as const,
    avatar: null,
    createdAt: '2026-01-15T10:00:00.000Z',
  },
  vetUser: {
    id: 'usr_002',
    email: 'vet@nvetcare.test',
    firstName: 'María',
    lastName: 'Pérez',
    phone: '+573009876543',
    role: 'VET' as const,
    avatar: null,
    createdAt: '2026-01-10T08:00:00.000Z',
  },
  vet: {
    id: 'vet_001',
    userId: 'usr_002',
    firstName: 'María',
    lastName: 'Pérez',
    avatar: null,
    tier: 'ELITE' as const,
    specialties: ['Medicina general', 'Cirugía menor', 'Vacunación'],
    rating: 4.8,
    reviewCount: 124,
    yearsExperience: 8,
    distanceKm: 2.5,
    city: 'Bogotá',
    isAvailableNow: true,
    minPriceCop: 80000,
    licenseNumber: 'COMVEZCOL-12345',
    bio: 'Médica veterinaria con énfasis en pequeños animales.',
    verificationStatus: 'APPROVED' as const,
  },
  pet: {
    id: 'pet_001',
    ownerId: 'usr_001',
    name: 'Firulais',
    species: 'DOG' as const,
    breed: 'Labrador',
    birthDate: '2022-04-15',
    weight: 18.5,
    notes: '',
  },
  appointment: {
    id: 'apt_001',
    clientId: 'usr_001',
    vetId: 'vet_001',
    petId: 'pet_001',
    serviceType: 'GENERAL_CONSULTATION' as const,
    status: 'PENDING' as const,
    scheduledAt: '2026-05-02T15:00:00.000Z',
    address: 'Calle 100 # 8-50, Bogotá',
    amountCop: 80000,
    amountCtg: 80,
    notes: '',
    createdAt: '2026-05-01T10:00:00.000Z',
  },
  balance: {
    ctgBalance: 250.5,
    cop: 250500,
    pendingCtg: 10,
  },
  ctgRate: { rate: 1000, asOf: '2026-05-01T03:00:00.000Z' },
}

// ── Handlers ─────────────────────────────────────────────────────
export const handlers = [
  // Auth
  http.post('*/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.email === FIXTURES.user.email && body.password === 'TestClient123!') {
      return HttpResponse.json({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        user: FIXTURES.user,
      })
    }
    if (body.email === FIXTURES.vetUser.email && body.password === 'TestVet123!') {
      return HttpResponse.json({
        accessToken: 'mock-access-token-vet',
        refreshToken: 'mock-refresh-token-vet',
        user: FIXTURES.vetUser,
      })
    }
    return HttpResponse.json(
      { statusCode: 401, message: 'Credenciales inválidas' },
      { status: 401 },
    )
  }),

  http.post('*/auth/register', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      user: { ...FIXTURES.user, email: body.email, role: body.role },
    })
  }),

  http.get('*/users/me', () => HttpResponse.json(FIXTURES.user)),

  http.post('*/auth/logout', () =>
    HttpResponse.json({ success: true }, { status: 200 }),
  ),

  http.post('*/auth/refresh', () =>
    HttpResponse.json({
      accessToken: 'mock-access-token-refreshed',
      refreshToken: 'mock-refresh-token-refreshed',
    }),
  ),

  http.patch('*/users/me', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...FIXTURES.user, ...body })
  }),

  // Vets
  http.get('*/vets/search', ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get('q') ?? ''
    const cursor = url.searchParams.get('cursor')
    const baseList = q
      ? [{ ...FIXTURES.vet, firstName: 'Match' + q }]
      : [FIXTURES.vet, { ...FIXTURES.vet, id: 'vet_002', tier: 'PRO', firstName: 'Andrés' }]
    return HttpResponse.json({
      items: baseList,
      nextCursor: cursor ? null : 'page-2',
      hasMore: !cursor,
    })
  }),

  http.get('*/vets/:id', ({ params }) =>
    HttpResponse.json({ ...FIXTURES.vet, id: params.id }),
  ),

  http.get('*/vets/:id/schedule', () =>
    HttpResponse.json({
      slots: [
        { date: '2026-05-02', time: '09:00', available: true },
        { date: '2026-05-02', time: '10:00', available: true },
        { date: '2026-05-02', time: '15:00', available: true },
      ],
    }),
  ),

  http.get('*/vets/:id/prices', () =>
    HttpResponse.json([
      {
        id: 'svc_001',
        vetId: 'vet_001',
        type: 'GENERAL_CONSULTATION',
        name: 'Consulta general',
        priceCop: 80000,
        priceCtg: 80,
        isActive: true,
      },
    ]),
  ),

  http.get('*/vets/:id/reviews', () =>
    HttpResponse.json({ items: [], total: 0 }),
  ),

  http.get('*/vets/me/verification', () =>
    HttpResponse.json({ status: 'APPROVED', documents: [] }),
  ),

  // Pets
  http.get('*/pets', () => HttpResponse.json([FIXTURES.pet])),
  http.post('*/pets', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      { ...FIXTURES.pet, ...body, id: 'pet_' + Date.now() },
      { status: 201 },
    )
  }),

  // Appointments
  http.get('*/appointments', ({ request }) => {
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const list = status === 'COMPLETED' ? [] : [FIXTURES.appointment]
    return HttpResponse.json(list)
  }),

  http.get('*/appointments/:id', ({ params }) =>
    HttpResponse.json({ ...FIXTURES.appointment, id: params.id }),
  ),

  http.post('*/appointments', async ({ request }) => {
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey) {
      return HttpResponse.json(
        { statusCode: 400, message: 'Idempotency-Key required' },
        { status: 400 },
      )
    }
    const body = (await request.json()) as Record<string, unknown>
    await delay(50)
    return HttpResponse.json(
      { ...FIXTURES.appointment, ...body, id: 'apt_' + Date.now() },
      { status: 201 },
    )
  }),

  http.patch('*/appointments/:id/cancel', ({ params }) =>
    HttpResponse.json({ ...FIXTURES.appointment, id: params.id, status: 'CANCELLED' }),
  ),

  http.patch('*/appointments/:id/status', async ({ request, params }) => {
    const body = (await request.json()) as { status: string }
    return HttpResponse.json({ ...FIXTURES.appointment, id: params.id, status: body.status })
  }),

  // Payments
  http.post('*/payments/process', async ({ request }) => {
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey) {
      return HttpResponse.json(
        { statusCode: 400, message: 'Idempotency-Key required' },
        { status: 400 },
      )
    }
    await delay(80)
    return HttpResponse.json({
      transactionId: 'tx_' + Date.now(),
      status: 'CONFIRMED',
      amountCop: 80000,
      amountCtg: 80,
    })
  }),

  http.get('*/payments/balance', () => HttpResponse.json(FIXTURES.balance)),

  http.get('*/payments/transactions', () =>
    HttpResponse.json({
      items: [
        {
          id: 'tx_001',
          type: 'PAYMENT',
          status: 'CONFIRMED',
          amountCop: 80000,
          amountCtg: 80,
          createdAt: '2026-04-30T15:00:00.000Z',
        },
      ],
      hasMore: false,
    }),
  ),

  http.get('*/payments/ctg/rate', () => HttpResponse.json(FIXTURES.ctgRate)),

  http.get('*/payments/earnings', () =>
    HttpResponse.json({
      gross: 1500000,
      commissions: 150000,
      net: 1350000,
      monthly: [],
    }),
  ),

  // Catch-all que falle ruidosamente para detectar rutas no mockeadas
  http.all('*', ({ request }) => {
    console.warn(`[MSW] unhandled request: ${request.method} ${request.url}`)
    return HttpResponse.json(
      { statusCode: 501, message: 'Not mocked' },
      { status: 501 },
    )
  }),
]
