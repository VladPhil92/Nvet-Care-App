import assert from 'node:assert/strict';
import test from 'node:test';
import { createRailwayGraphqlClient } from './lib/railway-graphql-client.mjs';

function response(status, body) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function client(fetchImpl, overrides = {}) {
  return createRailwayGraphqlClient({
    apiUrl: 'https://railway.invalid/graphql',
    token: 'test-token',
    fetchImpl,
    waitImpl: async () => {},
    baseDelayMs: 1,
    maxDelayMs: 1,
    logger: { warn() {} },
    ...overrides,
  });
}

test('retries transient non-JSON 503 and returns the successful response', async () => {
  let calls = 0;
  const graphql = client(async () => {
    calls += 1;
    if (calls === 1) return response(503, 'upstream connect error');
    return response(200, { data: { deployment: { status: 'SUCCESS' } } });
  });

  const data = await graphql('query Deployment { deployment { status } }');
  assert.equal(calls, 2);
  assert.equal(data.deployment.status, 'SUCCESS');
});

test('retries a network exception and recovers', async () => {
  let calls = 0;
  const graphql = client(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return response(200, { data: { ok: true } });
  });

  assert.deepEqual(await graphql('query Test { ok }'), { ok: true });
  assert.equal(calls, 2);
});

test('fails immediately on a permanent non-JSON 400', async () => {
  let calls = 0;
  const graphql = client(async () => {
    calls += 1;
    return response(400, 'bad request');
  });

  await assert.rejects(() => graphql('query Bad { bad }'), /non-JSON HTTP 400/);
  assert.equal(calls, 1);
});

test('fails immediately on GraphQL semantic errors', async () => {
  let calls = 0;
  const graphql = client(async () => {
    calls += 1;
    return response(200, { errors: [{ message: 'Unknown field' }] });
  });

  await assert.rejects(() => graphql('query Bad { bad }'), /Unknown field/);
  assert.equal(calls, 1);
});

test('fails closed after exhausting transient retries', async () => {
  let calls = 0;
  const graphql = client(
    async () => {
      calls += 1;
      return response(503, 'upstream unavailable');
    },
    { maxAttempts: 3 },
  );

  await assert.rejects(
    () => graphql('query Deployment { deployment { status } }'),
    /transient failure after 3 attempts/,
  );
  assert.equal(calls, 3);
});
