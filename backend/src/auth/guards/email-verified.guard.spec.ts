import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  EmailVerifiedGuard,
  SKIP_EMAIL_VERIFICATION_KEY,
} from './email-verified.guard';

describe('EmailVerifiedGuard', () => {
  let guard: EmailVerifiedGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new EmailVerifiedGuard(reflector);
    jest.spyOn((guard as any).logger, 'warn').mockImplementation(() => {});
  });

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  function buildContext(req: any): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  // -----------------------------------------------------------------
  // Permite
  // -----------------------------------------------------------------

  it('permite cuando emailVerified=true', () => {
    const ctx = buildContext({
      method: 'POST',
      url: '/appointments',
      user: { id: 'u1', role: 'CLIENT', emailVerified: true },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite a usuarios ADMIN aunque tengan emailVerified=false', () => {
    const ctx = buildContext({
      method: 'POST',
      url: '/admin/anything',
      user: { id: 'admin1', role: 'ADMIN', emailVerified: false },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite cuando @SkipEmailVerification() está aplicado', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: string) => {
        if (key === SKIP_EMAIL_VERIFICATION_KEY) return true;
        return undefined;
      });

    const ctx = buildContext({
      method: 'GET',
      url: '/auth/me',
      user: { id: 'u1', role: 'CLIENT', emailVerified: false },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  // -----------------------------------------------------------------
  // Rechaza
  // -----------------------------------------------------------------

  it('bloquea con ForbiddenException cuando emailVerified=false', () => {
    const ctx = buildContext({
      method: 'POST',
      url: '/appointments',
      user: { id: 'u1', role: 'CLIENT', emailVerified: false },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    try {
      guard.canActivate(ctx);
    } catch (e: any) {
      expect(e.getResponse()).toMatchObject({
        error: 'EMAIL_NOT_VERIFIED',
        action: 'send_verification_email',
      });
    }
  });

  it('bloquea con ForbiddenException si no hay user en req', () => {
    const ctx = buildContext({
      method: 'POST',
      url: '/appointments',
      user: undefined,
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow(/Autenticación requerida/i);
  });

  it('bloquea cuando emailVerified es undefined (defensa explícita)', () => {
    // Si el JWT strategy no pobló el campo, el guard NO debe asumir verified.
    const ctx = buildContext({
      method: 'POST',
      url: '/appointments',
      user: { id: 'u1', role: 'CLIENT' /* emailVerified missing */ },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
