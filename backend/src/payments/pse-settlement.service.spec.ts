import {
  AppointmentStatus,
  PaymentMethod,
  TransactionStatus,
} from '@prisma/client';
import { PseSettlementService } from './pse-settlement.service';

describe('PseSettlementService', () => {
  let prisma: any;
  let service: PseSettlementService;

  beforeEach(() => {
    prisma = {
      transaction: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback: any) =>
        callback({
          transaction: { update: jest.fn().mockResolvedValue({}) },
          appointment: { update: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };
    service = new PseSettlementService(prisma);
    jest.spyOn((service as any).logger, 'log').mockImplementation(() => {});
    jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});
  });

  it('permite PENDING y después APPROVED con el mismo externalTransactionId', async () => {
    prisma.transaction.findUnique
      .mockResolvedValueOnce({
        id: 'tx-1',
        appointmentId: 'apt-1',
        paymentMethod: PaymentMethod.PSE,
        amountCop: 90000,
        status: TransactionStatus.PENDING,
        appointment: { id: 'apt-1' },
      })
      .mockResolvedValueOnce({
        id: 'tx-1',
        appointmentId: 'apt-1',
        paymentMethod: PaymentMethod.PSE,
        amountCop: 90000,
        status: TransactionStatus.PENDING,
        appointment: { id: 'apt-1' },
      });

    const base = {
      externalTransactionId: 'pse-ext-1',
      transactionId: 'tx-1',
      amount: 90000,
    };

    await service.handle({ ...base, status: 'PENDING' });
    expect(prisma.$transaction).not.toHaveBeenCalled();

    let transactionUpdate: jest.Mock | undefined;
    let appointmentUpdate: jest.Mock | undefined;
    prisma.$transaction.mockImplementationOnce(async (callback: any) => {
      transactionUpdate = jest.fn().mockResolvedValue({});
      appointmentUpdate = jest.fn().mockResolvedValue({});
      return callback({
        transaction: { update: transactionUpdate },
        appointment: { update: appointmentUpdate },
      });
    });

    await service.handle({ ...base, status: 'APPROVED' });

    expect(transactionUpdate).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: expect.objectContaining({
        status: TransactionStatus.CONFIRMED,
        verifiedAt: expect.any(Date),
      }),
    });
    expect(appointmentUpdate).toHaveBeenCalledWith({
      where: { id: 'apt-1' },
      data: { status: AppointmentStatus.CONFIRMED },
    });
  });

  it('hace no-op ante replay de APPROVED ya confirmado', async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      appointmentId: 'apt-1',
      paymentMethod: PaymentMethod.PSE,
      amountCop: 90000,
      status: TransactionStatus.CONFIRMED,
      appointment: { id: 'apt-1' },
    });

    await service.handle({
      externalTransactionId: 'pse-ext-1',
      transactionId: 'tx-1',
      status: 'APPROVED',
      amount: 90000,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no degrada un pago confirmado por un DECLINED tardío', async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      appointmentId: 'apt-1',
      paymentMethod: PaymentMethod.PSE,
      amountCop: 90000,
      status: TransactionStatus.CONFIRMED,
      appointment: { id: 'apt-1' },
    });

    await service.handle({
      externalTransactionId: 'pse-ext-1',
      transactionId: 'tx-1',
      status: 'DECLINED',
      amount: 90000,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza silenciosamente un monto que no coincide', async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      appointmentId: 'apt-1',
      paymentMethod: PaymentMethod.PSE,
      amountCop: 90000,
      status: TransactionStatus.PENDING,
      appointment: { id: 'apt-1' },
    });

    await service.handle({
      externalTransactionId: 'pse-ext-1',
      transactionId: 'tx-1',
      status: 'APPROVED',
      amount: 100,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
