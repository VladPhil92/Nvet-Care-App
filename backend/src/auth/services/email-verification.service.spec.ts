import * as crypto from 'crypto';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailVerificationService } from './email-verification.service';

/**
 * Tests del flujo de verificación de email.
 *
 * Decisiones cubiertas:
 *  - Token 256-bit + SHA-256 hashed en DB
 *  - TTL 24h
 *  - Single-use (limpieza tras consumo)
 *  - Idempotente: si ya estaba verificado, retorna OK
 *  - Conflict si user verifica nuevamente teniendo cuenta ya verificada
 *  - UnauthorizedException si token inválido / expirado / user inactivo
 *  - Audit log invocado en éxito
 *  - MailService invocado con verifyLink correcto
 */
describe('EmailVerificationService', () => {
  let service: EmailVerificationService;
  let prisma: any;
  let auditService: { log: jest.Mock };
  let mailService: { sendEmailVerification: jest.Mock };

  const USER_ID = 'user-123';

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    mailService = {
      sendEmailVerification: jest
        .fn()
        .mockResolvedValue({ ok: true, providerMessageId: 'msg-1', driver: 'console' }),
    };

    service = new EmailVerificationService(
      prisma,
      auditService as any,
      mailService as any,
    );
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
  });

  // =================================================================
  // requestVerification
  // =================================================================

  describe('requestVerification', () => {
    it('genera token, persiste hash, dispara email y audit', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'user@example.com',
        firstName: 'Carlos',
        emailVerified: false,
        isActive: true,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.requestVerification(USER_ID, {
        ip: '1.2.3.4',
      });

      expect(result.expiresInHours).toBe(24);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: expect.objectContaining({
            emailVerificationTokenHash: expect.any(String),
            emailVerificationExpiresAt: expect.any(Date),
          }),
        }),
      );

      // Hash debe ser SHA-256 hex (64 chars)
      const persistedHash =
        prisma.user.update.mock.calls[0][0].data.emailVerificationTokenHash;
      expect(persistedHash).toMatch(/^[a-f0-9]{64}$/);

      // Mail debe haberse invocado con un verifyLink que contiene el token
      expect(mailService.sendEmailVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          firstName: 'Carlos',
          expiresInHours: 24,
          verifyLink: expect.stringMatching(/\/verify-email\?token=user-123\./),
        }),
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMAIL_VERIFICATION_SENT',
          targetType: 'User',
          targetId: USER_ID,
        }),
      );
    });

    it('lanza ConflictException si el email ya está verificado', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'verified@example.com',
        firstName: 'Ana',
        emailVerified: true,
        isActive: true,
      });

      await expect(service.requestVerification(USER_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('lanza UnauthorizedException si user no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.requestVerification(USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('lanza UnauthorizedException si user inactive', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        emailVerified: false,
        isActive: false,
      });
      await expect(service.requestVerification(USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // =================================================================
  // verifyEmail
  // =================================================================

  describe('verifyEmail', () => {
    /**
     * Helper: prepara un user mock con un token válido cuyo hash matchea
     * el rawToken pasado.
     */
    function makeUserWithToken(rawToken: string, overrides: any = {}) {
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');
      return {
        id: USER_ID,
        email: 'user@example.com',
        emailVerified: false,
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: new Date(Date.now() + 60_000),
        isActive: true,
        ...overrides,
      };
    }

    it('verifica exitosamente con token válido y limpia hash', async () => {
      const rawToken = 'a'.repeat(64);
      const publicToken = `${USER_ID}.${rawToken}`;
      prisma.user.findUnique.mockResolvedValue(makeUserWithToken(rawToken));
      prisma.user.update.mockResolvedValue({});

      const result = await service.verifyEmail(publicToken);

      expect(result.emailVerified).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: {
          emailVerified: true,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
        },
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'EMAIL_VERIFIED',
          targetId: USER_ID,
        }),
      );
    });

    it('idempotente: si ya estaba verificado retorna OK sin error', async () => {
      const rawToken = 'b'.repeat(64);
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'user@example.com',
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        isActive: true,
      });

      const result = await service.verifyEmail(`${USER_ID}.${rawToken}`);

      expect(result.emailVerified).toBe(true);
      expect(result.message).toMatch(/ya estaba verificado/i);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rechaza con BadRequestException si el formato del token es inválido', async () => {
      await expect(service.verifyEmail('not-a-valid-format')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.verifyEmail('foo.bar.baz')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza con UnauthorizedException si user no existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.verifyEmail(`${USER_ID}.${'c'.repeat(64)}`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza si user existe pero no tiene token pendiente', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        email: 'user@example.com',
        emailVerified: false,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        isActive: true,
      });

      await expect(
        service.verifyEmail(`${USER_ID}.${'d'.repeat(64)}`),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.verifyEmail(`${USER_ID}.${'d'.repeat(64)}`),
      ).rejects.toThrow(/solicitud.*pendiente|nuevo enlace/i);
    });

    it('rechaza con UnauthorizedException si el token no matchea el hash', async () => {
      const realToken = 'e'.repeat(64);
      prisma.user.findUnique.mockResolvedValue(makeUserWithToken(realToken));

      await expect(
        service.verifyEmail(`${USER_ID}.${'f'.repeat(64)}`),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rechaza con UnauthorizedException si el token expiró', async () => {
      const rawToken = 'g'.repeat(64);
      prisma.user.findUnique.mockResolvedValue(
        makeUserWithToken(rawToken, {
          emailVerificationExpiresAt: new Date(Date.now() - 1_000), // expirado
        }),
      );

      await expect(
        service.verifyEmail(`${USER_ID}.${rawToken}`),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.verifyEmail(`${USER_ID}.${rawToken}`),
      ).rejects.toThrow(/expir/i);
    });
  });
});
