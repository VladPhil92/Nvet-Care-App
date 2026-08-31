import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ChatMembershipGuard } from './chat-membership.guard';

describe('ChatMembershipGuard', () => {
  let guard: ChatMembershipGuard;
  let prisma: {
    appointment: { findUnique: jest.Mock };
    message: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      appointment: { findUnique: jest.fn() },
      message: { findUnique: jest.fn() },
    };
    guard = new ChatMembershipGuard(prisma as any);
    jest.spyOn((guard as any).logger, 'warn').mockImplementation(() => {});
  });

  function buildContext(req: any): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  const APPT = {
    id: 'appt-1',
    clientId: 'client-1',
    vet: { userId: 'vet-1' },
  };

  it('ADMIN siempre tiene acceso (no consulta DB)', async () => {
    const req = {
      user: { id: 'admin-1', role: 'ADMIN' },
      params: { appointmentId: 'appt-1' },
    };
    const result = await guard.canActivate(buildContext(req));
    expect(result).toBe(true);
    expect(prisma.appointment.findUnique).not.toHaveBeenCalled();
  });

  it('SUPERADMIN efectivo conserva acceso global (no consulta DB)', async () => {
    const req = {
      user: { id: 'root-1', role: 'SUPERADMIN' },
      params: { appointmentId: 'appt-1' },
    };
    const result = await guard.canActivate(buildContext(req));
    expect(result).toBe(true);
    expect(prisma.appointment.findUnique).not.toHaveBeenCalled();
  });

  it('permite al cliente dueño de la cita y cachea appointment + chatRole', async () => {
    prisma.appointment.findUnique.mockResolvedValue(APPT);
    const req: any = {
      user: { id: 'client-1', role: 'CLIENT' },
      params: { appointmentId: 'appt-1' },
    };
    const result = await guard.canActivate(buildContext(req));
    expect(result).toBe(true);
    expect(req.appointment).toBe(APPT);
    expect(req.chatRole).toBe('CLIENT');
  });

  it('permite al vet de la cita cuando el rol efectivo es VET', async () => {
    prisma.appointment.findUnique.mockResolvedValue(APPT);
    const req: any = {
      user: { id: 'vet-1', role: 'VET' },
      params: { appointmentId: 'appt-1' },
    };
    const result = await guard.canActivate(buildContext(req));
    expect(result).toBe(true);
    expect(req.chatRole).toBe('VET');
  });

  it('CLIENT mode no hereda la relación de veterinario de la misma identidad', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      clientId: 'other-client',
      vet: { userId: 'root-user' },
    });
    const req = {
      user: { id: 'root-user', role: 'CLIENT' },
      params: { appointmentId: 'appt-1' },
    };

    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('VET mode no hereda la relación de cliente de la misma identidad', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'appt-1',
      clientId: 'dual-user',
      vet: { userId: 'other-vet' },
    });
    const req = {
      user: { id: 'dual-user', role: 'VET' },
      params: { appointmentId: 'appt-1' },
    };

    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechaza con ForbiddenException si el user no es participante bajo su rol efectivo', async () => {
    prisma.appointment.findUnique.mockResolvedValue(APPT);
    const req = {
      user: { id: 'other-user', role: 'CLIENT' },
      params: { appointmentId: 'appt-1' },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('resuelve appointmentId desde messageId cuando solo hay messageId en params', async () => {
    prisma.message.findUnique.mockResolvedValue({ appointmentId: 'appt-1' });
    prisma.appointment.findUnique.mockResolvedValue(APPT);
    const req: any = {
      user: { id: 'client-1', role: 'CLIENT' },
      params: { messageId: 'msg-1' },
    };
    const result = await guard.canActivate(buildContext(req));
    expect(result).toBe(true);
    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      select: { appointmentId: true },
    });
  });

  it('NotFoundException cuando el mensaje referenciado no existe', async () => {
    prisma.message.findUnique.mockResolvedValue(null);
    const req = {
      user: { id: 'client-1', role: 'CLIENT' },
      params: { messageId: 'msg-missing' },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('NotFoundException cuando la cita no existe', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    const req = {
      user: { id: 'client-1', role: 'CLIENT' },
      params: { appointmentId: 'appt-missing' },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('BadRequestException cuando no hay appointmentId ni messageId', async () => {
    const req = {
      user: { id: 'client-1', role: 'CLIENT' },
      params: {},
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('ForbiddenException si no hay user (defensa en profundidad)', async () => {
    const req = {
      user: undefined,
      params: { appointmentId: 'appt-1' },
    };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
