const required = [
  'E2E_API_URL',
  'E2E_CLIENT_EMAIL',
  'E2E_CLIENT_PASSWORD',
  'E2E_VET_EMAIL',
  'E2E_VET_PASSWORD',
]

for (const name of required) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing required E2E variable: ${name}`)
  }
}

const apiUrl = process.env.E2E_API_URL.replace(/\/$/, '')

if (!/^https:\/\/[^\s]+\/api$/i.test(apiUrl)) {
  throw new Error('E2E_API_URL must be an absolute HTTPS URL ending in /api')
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = 15_000) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const assertOk = async (label, response) => {
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const snippet = body.slice(0, 300).replace(/\s+/g, ' ')
    throw new Error(`${label} failed with HTTP ${response.status}: ${snippet}`)
  }
}

const readJson = async (label, response) => {
  await assertOk(label, response)
  try {
    return await response.json()
  } catch {
    throw new Error(`${label} returned a non-JSON response`)
  }
}

const readiness = await fetchWithTimeout(`${apiUrl}/health/ready`, {
  headers: { accept: 'application/json' },
})
await assertOk('Backend readiness', readiness)

const login = async (label, expectedRole, email, password) => {
  const response = await fetchWithTimeout(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'nvet-e2e-preflight/1.0',
    },
    body: JSON.stringify({ email, password }),
  })

  const payload = await readJson(`${label} fixture login`, response)

  if (!payload?.accessToken || typeof payload.accessToken !== 'string') {
    throw new Error(`${label} fixture login did not return an access token`)
  }

  if (payload?.user?.role !== expectedRole) {
    throw new Error(
      `${label} fixture login returned role ${payload?.user?.role ?? 'missing'}; expected ${expectedRole}`,
    )
  }

  return payload
}

await login(
  'Client',
  'CLIENT',
  process.env.E2E_CLIENT_EMAIL,
  process.env.E2E_CLIENT_PASSWORD,
)
await login(
  'Vet',
  'VET',
  process.env.E2E_VET_EMAIL,
  process.env.E2E_VET_PASSWORD,
)

const emergencySearchUrl = new URL(`${apiUrl}/vets`)
emergencySearchUrl.searchParams.set('specialty', 'Emergencias')
emergencySearchUrl.searchParams.set('availableNow', 'true')
emergencySearchUrl.searchParams.set('limit', '20')

const emergencySearch = await fetchWithTimeout(emergencySearchUrl, {
  headers: {
    accept: 'application/json',
    'user-agent': 'nvet-e2e-preflight/1.0',
  },
})
const searchPayload = await readJson('Emergency vet fixture search', emergencySearch)

if (!Array.isArray(searchPayload?.results)) {
  throw new Error('Emergency vet fixture search did not return a results array')
}

const emergencyFixture = searchPayload.results.find(
  (vet) => vet?.licenseNumber === 'NVET-E2E-0001',
)

if (!emergencyFixture) {
  throw new Error(
    'Emergency vet fixture search did not return NVET-E2E-0001. Re-run the staging E2E seed before Detox.',
  )
}

if (emergencyFixture.isAvailableNow !== true) {
  throw new Error('Emergency vet fixture is not marked available now')
}

if (
  !Array.isArray(emergencyFixture.specialties) ||
  !emergencyFixture.specialties.includes('Emergencias')
) {
  throw new Error('Emergency vet fixture is missing the Emergencias specialty')
}

console.log(
  'E2E staging preflight passed: readiness + client/vet authentication + emergency fixture search.',
)
