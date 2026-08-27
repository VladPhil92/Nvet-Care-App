import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentMethod, TransactionStatus, AppointmentStatus, VetTier } from '@prisma/client';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;
  let storage: any;

  const CLIENT_ID = 'client-1';
  const VET_USER_ID = 'vet-user-1';
  const VET_PROFILE_ID = 'vet-profile-1';
  const APPT_ID = 'appt-1';
  const TX_ID = 'tx-1';

  const baseAppointment = {
    id: APPT_ID,
    clientId: CLIENT_ID,
    amount: 100_000,
    transaction: null,
    vet: { id: VET_PROFILE_ID, userId: VET_USER_ID, tier: VetTier.FREE },
  };

  beforeEach(() => {
    prisma = {
      appointment: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
    };

    storage = { upload: jest.fn(), delete: jest.fn() };

    service = new PaymentsService(prisma, storage);
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
  });

  // ─────────────────────────────────────────────────────────────────
  // processPayment
  // ─────────────────────────────────────────────────────────────────

  describe('processPayment', () => {
    it('crea transacción CTG con estado CONFIRMED', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
      const created = { id: TX_ID, status: TransactionStatus.CONFIRMED };
      prisma.transaction.create.mockResolvedValue(created);
      prisma.appointment.update.mockResolvedValue({});

      const result = await service.processPayment(CLIENT_ID, {
        appointmentId: APPT_ID,
        paymentMethod: PaymentMethod.CTG,
        amountCop: 100_000,
      });

      expect(result.status).toBe(TransactionStatus.CONFIRMED);
      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentMethod: PaymentMethod.CTG,
            status: TransactionStatus.CONFIRMED,
          }),
        }),
      );
    });

    it('crea transacción PSE con estado PENDING', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
      const created = { id: TX_ID, status: TransactionStatus.PENDING };
      prisma.transaction.create.mockResolvedValue(created);

      const result = await service.processPayment(CLIENT_ID, {
        appointmentId: APPT_ID,
        paymentMethod: PaymentMethod.PSE,
        amountCop: 100_000,
      });

      expect(result.status).toBe(TransactionStatus.PENDING);
    });

    it('lanza NotFoundException si la cita no existe', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);

      await expect(
        service.processPayment(CLIENT_ID, {
          appointmentId: 'no-existe',
          paymentMethod: PaymentMethod.PSE,
          amountCop: 100_000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ForbiddenException si el cliente no es dueño de la cita', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        clientId: 'otro-cliente',
      });

      await expect(
        service.processPayment(CLIENT_ID, {
          appointmentId: APPT_ID,
          paymentMethod: PaymentMethod.PSE,
          amountCop: 100_000,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza BadRequestException si el monto no coincide con la cita', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment);

      await expect(
        service.processPayment(CLIENT_ID, {
          appointmentId: APPT_ID,
          paymentMethod: PaymentMethod.PSE,
          amountCop: 50_000, // distinto a 100_000
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza ConflictException si ya existe una transacción no fallida', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        ...baseAppointment,
        transaction: { id: TX_ID, status: TransactionStatus.CONFIRMED },
      });

      await expect(
        service.processPayment(CLIENT_ID, {
          appointmentId: APPT_ID,
          paymentMethod: PaymentMethod.PSE,
          amountCop: 100_000,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('retorna resultado cacheado con idempotencyKey repetida', async () => {
      const cachedResult = { id: TX_ID, status: TransactionStatus.CONFIRMED };
      (service as any).idempotencyCache.set('key-abc', {
        result: cachedResult,
        ts: Date.now(),
      });

      const result = await service.processPayment(CLIENT_ID, {
        appointmentId: APPT_ID,
        paymentMethod: PaymentMethod.PSE,
        amountCop: 100_000,
        idempotencyKey: 'key-abc',
      });

      expect(result).toEqual(cachedResult);
      expect(prisma.appointment.findUnique).not.toHaveBeenCalled();
    });

    it('aplica comisión correcta según tier FREE (10%)', async () => {
      prisma.appointment.findUnique.mockResolvedValue(baseAppointment);
      prisma.transaction.create.mockResolvedValue({ id: TX_ID });

      await service.processPayment(CLIENT_ID, {
        appointmentId: APPT_ID,
        paymentMethod: PaymentMethod.TRANSFER,
        amountCop: 100_000,
      });

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            commissionPct: 10, // 0.10 * 100
            commissionAmount: 10_000,
          }),
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // handlePseWebhook
  // ─────────────────────────────────────────────────────────────────

  describe('handlePseWebhook', () => {
    const baseTransaction = {
      id: TX_ID,
      paymentMethod: PaymentMethod.PSE,
      status: TransactionStatus.PENDING,
      amountCop: 100_000,
      appointmentId: APPT_ID,
      appointment: { id: APPT_ID },
    };

    it('transición APPROVED → CONFIRMED y confirma la cita', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseTransaction);
      prisma.transaction.update.mockResolvedValue({});
      prisma.appointment.update.mockResolvedValue({});

      await service.handlePseWebhook({
        externalTransactionId: 'ext-1',
        transactionId: TX_ID,
        status: 'APPROVED',
      });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: TransactionStatus.CONFIRMED }),
        }),
      );
      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: AppointmentStatus.CONFIRMED }),
        }),
      );
    });

    it('transición DECLINED → FAILED sin actualizar cita', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseTransaction);
      prisma.transaction.update.mockResolvedValue({});
      prisma.appointment.update.mockResolvedValue({});

      await service.handlePseWebhook({
        externalTransactionId: 'ext-2',
        transactionId: TX_ID,
        status: 'DECLINED',
      });

      expect(prisma.transaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: TransactionStatus.FAILED }),
        }),
      );
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });

    it('ignora webhook cuando la transacción no existe', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);

      await service.handlePseWebhook({
        externalTransactionId: 'ext-3',
        transactionId: 'no-existe',
        status: 'APPROVED',
      });

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('rechaza si el monto no coincide (anti-fraude)', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseTransaction);

      await service.handlePseWebhook({
        externalTransactionId: 'ext-4',
        transactionId: TX_ID,
        status: 'APPROVED',
        amount: 1_000, // ≠ 100_000
      });

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it('es idempotente: no re-procesa un externalTransactionId ya visto', async () => {
      // Primer webhook
      prisma.transaction.findUnique.mockResolvedValue(baseTransaction);
      prisma.transaction.update.mockResolvedValue({});
      prisma.appointment.update.mockResolvedValue({});

      await service.handlePseWebhook({
        externalTransactionId: 'idem-1',
        transactionId: TX_ID,
        status: 'APPROVED',
      });

      const callCount = prisma.transaction.update.mock.calls.length;

      // Segundo webhook idéntico
      await service.handlePseWebhook({
        externalTransactionId: 'idem-1',
        transactionId: TX_ID,
        status: 'APPROVED',
      });

      expect(prisma.transaction.update.mock.calls.length).toBe(callCount); // sin nuevas llamadas
    });

    it('ignora status PENDING sin hacer cambios', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseTransaction);

      await service.handlePseWebhook({
        externalTransactionId: 'ext-5',
        transactionId: TX_ID,
        status: 'PENDING',
      });

      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // verifyTransfer
  // ─────────────────────────────────────────────────────────────────

  describe('verifyTransfer', () => {
    const fakeFile = { originalname: 'recibo.pdf', buffer: Buffer.from('pdf') } as any;
    const baseTransaction = {
      id: TX_ID,
      paymentMethod: PaymentMethod.TRANSFER,
      status: TransactionStatus.PENDING,
      appointmentId: APPT_ID,
      appointment: {
        vet: { userId: VET_USER_ID },
      },
    };

    it('sube el comprobante y cambia estado a VERIFYING', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseTransaction);
      storage.upload.mockResolvedValue({ url: '/uploads/transfers/tx-1/recibo.pdf' });
      prisma.transaction.update.mockResolvedValue({ status: TransactionStatus.VERIFYING });

      const result = await service.verifyTransfer(VET_USER_ID, TX_ID, fakeFile, {
        transferCode: 'TRF-001',
      });

      expect(storage.upload).toHaveBeenCalledWith(
        fakeFile,
        `transfers/${TX_ID}`,
      );
      expect(result.status).toBe(TransactionStatus.VERIFYING);
    });

    it('lanza ForbiddenException si el vet no es el de la cita', async () => {
      prisma.transaction.findUnique.mockResolvedValue(baseTransaction);

      await expect(
        service.verifyTransfer('otro-vet', TX_ID, fakeFile, { transferCode: 'X' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lanza BadRequestException si el método no es TRANSFER', async () => {
      prisma.transaction.findUnique.mockResolvedValue({
        ...baseTransaction,
        paymentMethod: PaymentMethod.PSE,
      });

      await expect(
        service.verifyTransfer(VET_USER_ID, TX_ID, fakeFile, { transferCode: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si no se adjunta archivo', async () => {
      await expect(
        service.verifyTransfer(VET_USER_ID, TX_ID, null as any, { transferCode: 'X' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si la transacción no existe', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyTransfer(VET_USER_ID, 'no-existe', fakeFile, { transferCode: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // State machine
  // ─────────────────────────────────────────────────────────────────

  describe('validateStateTransition (private)', () => {
    const call = (current: TransactionStatus, next: TransactionStatus) =>
      (service as any).validateStateTransition(current, next);

    it('permite PENDING → CONFIRMED', () => {
      expect(() => call(TransactionStatus.PENDING, TransactionStatus.CONFIRMED)).not.toThrow();
    });

    it('permite CONFIRMED → LIQUIDATED', () => {
      expect(() => call(TransactionStatus.CONFIRMED, TransactionStatus.LIQUIDATED)).not.toThrow();
    });

    it('rechaza FAILED → CONFIRMED (terminal)', () => {
      expect(() => call(TransactionStatus.FAILED, TransactionStatus.CONFIRMED)).toThrow(BadRequestException);
    });

    it('rechaza LIQUIDATED → PENDING (hacia atrás)', () => {
      expect(() => call(TransactionStatus.LIQUIDATED, TransactionStatus.PENDING)).toThrow(BadRequestException);
    });
  });
});
