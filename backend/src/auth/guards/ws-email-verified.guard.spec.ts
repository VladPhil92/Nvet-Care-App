import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsEmailVerifiedGuard } from './ws-jwt.guard';

describe('WsEmailVerifiedGuard', () => {
  let guard: WsEmailVerifiedGuard;

  beforeEach(() => {
    guard = new WsEmailVerifiedGuard();
  });

  function buildContext(socketUser: any): ExecutionContext {
    return {
      switchToWs: () => ({ getClient: () => ({ user: socketUser }) }),
    } as unknown as ExecutionContext;
  }

  it('permite cuando emailVerified=true', () => {
    const ctx = buildContext({
      id: 'u1',
      role: 'CLIENT',
      emailVerified: true,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite ADMIN sin importar emailVerified', () => {
    const ctx = buildContext({
      id: 'admin1',
      role: 'ADMIN',
      emailVerified: false,
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rechaza con WsException si emailVerified=false', () => {
    const ctx = buildContext({
      id: 'u1',
      role: 'CLIENT',
      emailVerified: false,
    });
    expect(() => guard.canActivate(ctx)).toThrow(WsException);
    expect(() => guard.canActivate(ctx)).toThrow(/Verifica tu correo/i);
  });

  it('rechaza si no hay user en el socket (defensa)', () => {
    const ctx = buildContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(WsException);
    expect(() => guard.canActivate(ctx)).toThrow(/Authentication required/i);
  });

  it('rechaza VET no verificado igual que CLIENT', () => {
    const ctx = buildContext({
      id: 'v1',
      role: 'VET',
      emailVerified: false,
    });
    expect(() => guard.canActivate(ctx)).toThrow(WsException);
  });
});
