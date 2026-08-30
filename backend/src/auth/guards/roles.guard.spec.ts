import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function contextWithRole(role?: UserRole): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
      getResponse: jest.fn(),
      getNext: jest.fn(),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Pick<Reflector, 'getAllAndOverride'>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Pick<Reflector, 'getAllAndOverride'>;
    guard = new RolesGuard(reflector as Reflector);
  });

  it('allows routes without role requirements', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    expect(guard.canActivate(contextWithRole(UserRole.CLIENT))).toBe(true);
  });

  it('lets SUPERADMIN inherit ADMIN protected routes', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.ADMIN]);
    expect(guard.canActivate(contextWithRole(UserRole.SUPERADMIN))).toBe(true);
  });

  it('does not let ADMIN inherit SUPERADMIN routes', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.SUPERADMIN]);
    expect(guard.canActivate(contextWithRole(UserRole.ADMIN))).toBe(false);
  });

  it('does not implicitly grant VET permissions to SUPERADMIN', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.VET]);
    expect(guard.canActivate(contextWithRole(UserRole.SUPERADMIN))).toBe(false);
  });

  it('allows an exact role match', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.CLIENT]);
    expect(guard.canActivate(contextWithRole(UserRole.CLIENT))).toBe(true);
  });

  it('denies a protected route when the request has no authenticated role', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([UserRole.CLIENT]);
    expect(guard.canActivate(contextWithRole())).toBe(false);
  });
});
