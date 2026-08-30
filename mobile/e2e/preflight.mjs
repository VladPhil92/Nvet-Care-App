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

const readiness = await fetchWithTimeout(`${apiUrl}/health/ready`, {
  headers: { accept: 'application/json' },
})
await assertOk('Backend readiness', readiness)

const login = async (role, email, password) => {
  const response = await fetchWithTimeout(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'user-agent': 'nvet-e2e-preflight/1.0',
    },
    body: JSON.stringify({ email, password }),
  })

  await assertOk(`${role} fixture login`, response)
}

await login(
  'Client',
  process.env.E2E_CLIENT_EMAIL,
  process.env.E2E_CLIENT_PASSWORD,
)
await login('Vet', process.env.E2E_VET_EMAIL, process.env.E2E_VET_PASSWORD)

console.log('E2E staging preflight passed: readiness + client/vet authentication.')
