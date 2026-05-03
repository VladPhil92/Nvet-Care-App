import * as crypto from 'crypto';
import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PseWebhookGuard } from './pse-webhook.guard';

/**
 * Tests del guard que valida HMAC + timestamp de webhooks PSE.
 *
 * Escenarios cubiertos:
 *  - Firma HMAC válida pasa
 *  - Firma HMAC inválida es rechazada con UnauthorizedException
 *  - Falta del secret en env → ServiceUnavailableException (fail-closed)
 *  - Falta del header X-PSE-Signature → UnauthorizedException
 *  - Timestamp fuera de tolerancia (replay) → UnauthorizedException
 *  - Timestamp dentro de tolerancia → pasa
 *  - rawBody preservado se prefiere sobre body parseado (bit-exact)
 *  - Fallback JSON.stringify cuando no hay rawBody (dev only)
 */
describe('PseWebhookGuard', () => {
  const ORIGINAL_SECRET = process.env.PSE_WEBHOOK_SECRET;
  const TEST_SECRET = 'test-secret-do-not-use-in-prod';
  let guard: PseWebhookGuard;

  beforeEach(() => {
    process.env.PSE_WEBHOOK_SECRET = TEST_SECRET;
    guard = new PseWebhookGuard();
    // Silenciar logger para keep test output limpio
    jest.spyOn((guard as any).logger, 'warn').mockImplementation(() => {});
    jest.spyOn((guard as any).logger, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env.PSE_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  function buildContext(req: any): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  function hmacOf(raw: string | Buffer, secret = TEST_SECRET): string {
    return crypto.createHmac('sha256', secret).update(raw).digest('hex');
  }

  function nowSeconds(): string {
    return Math.floor(Date.now() / 1000).toString();
  }

  // -----------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------

  it('acepta una firma HMAC válida sobre rawBody', () => {
    const raw = Buffer.from('{"transactionId":"abc","status":"APPROVED"}');
    const sig = hmacOf(raw);
    const ctx = buildContext({
      headers: { 'x-pse-signature': sig, 'x-pse-timestamp': nowSeconds() },
      body: { transactionId: 'abc', status: 'APPROVED' },
      rawBody: raw,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('acepta sin header de timestamp (es opcional)', () => {
    const raw = Buffer.from('{"foo":"bar"}');
    const sig = hmacOf(raw);
    const ctx = buildContext({
      headers: { 'x-pse-signature': sig },
      body: { foo: 'bar' },
      rawBody: raw,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  // -----------------------------------------------------------------
  // Failure paths
  // -----------------------------------------------------------------

  it('rechaza firma HMAC inválida con UnauthorizedException', () => {
    const raw = Buffer.from('{"transactionId":"abc"}');
    const wrongSig = hmacOf(raw, 'attacker-secret');
    const ctx = buildContext({
      headers: { 'x-pse-signature': wrongSig },
      body: { transactionId: 'abc' },
      rawBody: raw,
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(/firma.*inválida/i);
  });

  it('rechaza si falta el header X-PSE-Signature', () => {
    const ctx = buildContext({
      headers: {},
      body: { foo: 'bar' },
      rawBody: Buffer.from('{"foo":"bar"}'),
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(/firma.*ausente/i);
  });

  it('rechaza fail-closed si PSE_WEBHOOK_SECRET no está configurado', () => {
    delete process.env.PSE_WEBHOOK_SECRET;
    const ctx = buildContext({
      headers: { 'x-pse-signature': 'aabbcc' },
      body: {},
      rawBody: Buffer.from('{}'),
    });

    expect(() => guard.canActivate(ctx)).toThrow(ServiceUnavailableException);
  });

  // -----------------------------------------------------------------
  // Anti-replay (timestamp tolerance)
  // -----------------------------------------------------------------

  it('rechaza con timestamp fuera de tolerancia (replay attack)', () => {
    const raw = Buffer.from('{"foo":"bar"}');
    const sig = hmacOf(raw);
    const tooOld = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
    const ctx = buildContext({
      headers: { 'x-pse-signature': sig, 'x-pse-timestamp': tooOld },
      body: { foo: 'bar' },
      rawBody: raw,
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(/replay/i);
  });

  it('acepta timestamp dentro de tolerancia ±5 min', () => {
    const raw = Buffer.from('{"foo":"bar"}');
    const sig = hmacOf(raw);
    const recentlyPast = (Math.floor(Date.now() / 1000) - 60).toString(); // 1 min ago
    const ctx = buildContext({
      headers: { 'x-pse-signature': sig, 'x-pse-timestamp': recentlyPast },
      body: { foo: 'bar' },
      rawBody: raw,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rechaza si timestamp no es numérico', () => {
    const raw = Buffer.from('{}');
    const sig = hmacOf(raw);
    const ctx = buildContext({
      headers: { 'x-pse-signature': sig, 'x-pse-timestamp': 'not-a-number' },
      body: {},
      rawBody: raw,
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx)).toThrow(/timestamp.*inválido/i);
  });

  // -----------------------------------------------------------------
  // Raw body handling
  // -----------------------------------------------------------------

  it('usa req.rawBody cuando está disponible (bit-exact)', () => {
    // Pretty-printed JSON con whitespace específico que JSON.stringify no replica
    const raw = Buffer.from('{\n  "foo": "bar"\n}');
    const sig = hmacOf(raw);
    const ctx = buildContext({
      headers: { 'x-pse-signature': sig },
      body: { foo: 'bar' }, // body parseado distinto al raw original
      rawBody: raw,
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('cae al fallback JSON.stringify si no hay rawBody', () => {
    // Sin rawBody, el guard usa JSON.stringify(body)
    const body = { foo: 'bar' };
    const sig = hmacOf(JSON.stringify(body));
    const ctx = buildContext({
      headers: { 'x-pse-signature': sig },
      body,
      // rawBody intentionally omitted
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('comparación timing-safe rechaza firma con longitud diferente', () => {
    const raw = Buffer.from('{}');
    const ctx = buildContext({
      headers: { 'x-pse-signature': 'aa' }, // hex válido pero corto
      body: {},
      rawBody: raw,
    });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
