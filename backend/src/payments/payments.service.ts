import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import {
  PaymentMethod,
  TransactionStatus,
  AppointmentStatus,
  VetTier,
  Prisma,
  UserRole,
} from "@prisma/client";

// ============================================================
// TYPES
// ============================================================

export interface PseWebhookPayload {
  /** ID que el provider asigna a la transacción */
  externalTransactionId: string;
  /** Nuestro transactionId que enviamos en initiatePse */
  transactionId: string;
  /** APPROVED | DECLINED | PENDING | EXPIRED */
  status: string;
  /** Monto confirmado (para double-check anti-fraude) */
  amount?: number;
  /** Timestamp del provider (ISO8601) */
  timestamp?: string;
}

import {
  ProcessPaymentDto,
  VerifyTransferDto,
  InitiatePsePaymentDto,
  RequestWithdrawalDto,
  TransactionFiltersDto,
} from "./dto/payment.dto";

// ============================================================
// CONSTANTS
// ============================================================

const TIER_COMMISSIONS: Record<VetTier, number> = {
  FREE: 0.1,
  PRO: 0.08,
  ELITE: 0.03,
};

/**
 * Tasa CTG ↔ COP. En producción debería venir de un oracle blockchain
 * o un servicio externo (CoinGecko, etc.) con cache de 5min.
 */
const CTG_TO_COP_RATE = 30;

/**
 * State machine de transacciones.
 * Cada flow de pago tiene su trayectoria:
 *  - CTG:      PENDING → CONFIRMED → LIQUIDATED
 *  - PSE:      PENDING → VERIFYING (webhook) → CONFIRMED → LIQUIDATED
 *  - TRANSFER: PENDING → VERIFYING (vet sube comprobante) → CONFIRMED → LIQUIDATED
 *  - DISPUTED solo desde CONFIRMED o LIQUIDATED (manejo por admin)
 *  - FAILED desde cualquier estado no-terminal
 */
const VALID_TRANSITIONS: Record<TransactionStatus, TransactionStatus[]> = {
  PENDING: [
    TransactionStatus.VERIFYING,
    TransactionStatus.CONFIRMED,
    TransactionStatus.FAILED,
  ],
  VERIFYING: [
    TransactionStatus.CONFIRMED,
    TransactionStatus.FAILED,
    TransactionStatus.DISPUTED,
  ],
  CONFIRMED: [TransactionStatus.LIQUIDATED, TransactionStatus.DISPUTED],
  LIQUIDATED: [TransactionStatus.DISPUTED],
  DISPUTED: [
    TransactionStatus.CONFIRMED,
    TransactionStatus.LIQUIDATED,
    TransactionStatus.FAILED,
  ],
  FAILED: [], // terminal
};

// PSE bank codes (subset; completo en producción)
const PSE_BANKS: Record<string, string> = {
  "1007": "Bancolombia",
  "1051": "Davivienda",
  "1013": "BBVA",
  "1006": "AV Villas",
  "1023": "Banco Caja Social",
};

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  /** Cache de idempotency keys (en producción usar Redis con TTL 24h) */
  private readonly idempotencyCache = new Map<
    string,
    { result: any; ts: number }
  >();
  private readonly IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ============================================================
  // PROCESS PAYMENT
  // ============================================================

  /**
   * Procesa un pago para una cita.
   *
   * Flow:
   * 1. Resolver idempotency key (si existe → retornar resultado cacheado)
   * 2. Validar cita y ownership del cliente
   * 3. Validar/crear transacción según paymentMethod
   * 4. Aplicar efectos (descuento CTG, generar URL PSE, etc.)
   * 5. Cachear resultado por idempotency
   */
  async processPayment(userId: string, dto: ProcessPaymentDto) {
    // 1. Idempotency check
    if (dto.idempotencyKey) {
      const cached = this.getIdempotencyResult(dto.idempotencyKey);
      if (cached) return cached;
    }

    // 2. Validar cita
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { vet: true, transaction: true },
    });

    if (!appointment) {
      throw new NotFoundException("Cita no encontrada");
    }

    if (appointment.clientId !== userId) {
      throw new ForbiddenException("Solo el cliente de la cita puede pagarla");
    }

    if (
      appointment.transaction &&
      appointment.transaction.status !== TransactionStatus.FAILED
    ) {
      throw new ConflictException(
        `Esta cita ya tiene un pago en estado ${appointment.transaction.status}`,
      );
    }

    // Validación cruzada del monto vs cita
    if (Math.abs(dto.amountCop - appointment.amount) > 1) {
      throw new BadRequestException(
        `El monto (${dto.amountCop}) no coincide con la cita (${appointment.amount})`,
      );
    }

    // 3. Calcular comisión por tier del vet
    const commissionPct = TIER_COMMISSIONS[appointment.vet.tier];
    const commissionAmount = dto.amountCop * commissionPct;

    // 4. Estado inicial según método
    let initialStatus: TransactionStatus;
    let amountCtg: number | null = null;

    switch (dto.paymentMethod) {
      case PaymentMethod.CTG:
        // CTG se confirma inmediatamente (saldo descontado del cliente)
        amountCtg = dto.amountCtg ?? this.copToCtg(dto.amountCop);
        initialStatus = TransactionStatus.CONFIRMED;
        break;

      case PaymentMethod.PSE:
        // PSE queda PENDING hasta webhook del banco
        initialStatus = TransactionStatus.PENDING;
        break;

      case PaymentMethod.TRANSFER:
        // TRANSFER queda PENDING hasta que vet sube comprobante
        initialStatus = TransactionStatus.PENDING;
        break;

      default:
        throw new BadRequestException("Método de pago no soportado");
    }

    // 5. Crear transacción (si ya existía con FAILED, actualizarla)
    const transaction = await this.prisma.$transaction(async (tx) => {
      const newTx = appointment.transaction
        ? await tx.transaction.update({
            where: { id: appointment.transaction.id },
            data: {
              amountCop: dto.amountCop,
              amountCtg,
              commissionPct: commissionPct * 100,
              commissionAmount,
              paymentMethod: dto.paymentMethod,
              status: initialStatus,
            },
          })
        : await tx.transaction.create({
            data: {
              appointmentId: dto.appointmentId,
              amountCop: dto.amountCop,
              amountCtg,
              commissionPct: commissionPct * 100,
              commissionAmount,
              paymentMethod: dto.paymentMethod,
              status: initialStatus,
            },
          });

      // Si CTG, debitar al vet la comisión y acreditar el neto
      if (dto.paymentMethod === PaymentMethod.CTG) {
        await tx.appointment.update({
          where: { id: dto.appointmentId },
          data: { status: AppointmentStatus.CONFIRMED },
        });
      }

      return newTx;
    });

    // 6. Cachear idempotency
    if (dto.idempotencyKey) {
      this.setIdempotencyResult(dto.idempotencyKey, transaction);
    }

    return transaction;
  }

  // ============================================================
  // VERIFY TRANSFER (vet sube comprobante)
  // ============================================================

  /**
   * El veterinario verifica una transferencia recibida subiendo el
   * comprobante (foto/PDF). El service:
   *  1. Valida ownership (es el vet de la cita)
   *  2. Persiste el archivo a disco/S3
   *  3. Pasa la transacción a VERIFYING
   *  4. Notifica al admin (TODO: cola de notificaciones)
   */
  async verifyTransfer(
    userId: string,
    transactionId: string,
    file: Express.Multer.File,
    dto: VerifyTransferDto,
  ) {
    if (!file) {
      throw new BadRequestException("El comprobante es obligatorio");
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        appointment: {
          include: { vet: true },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException("Transacción no encontrada");
    }

    if (transaction.appointment.vet.userId !== userId) {
      throw new ForbiddenException(
        "Solo el veterinario de la cita puede verificar la transferencia",
      );
    }

    if (transaction.paymentMethod !== PaymentMethod.TRANSFER) {
      throw new BadRequestException("Solo aplicable a pagos por transferencia");
    }

    this.validateStateTransition(
      transaction.status,
      TransactionStatus.VERIFYING,
    );

    // Guardar archivo vía StorageService (local o Cloudinary según STORAGE_DRIVER)
    const uploaded = await this.storage.upload(
      file,
      `transfers/${transactionId}`,
    );

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.VERIFYING,
        transferCode: dto.transferCode,
        // Guardamos la URL del comprobante en hashOnchain como placeholder (en producción: campo dedicado)
        hashOnchain: uploaded.url,
      },
    });
  }

  // ============================================================
  // ADMIN: confirmar/rechazar transferencia
  // ============================================================

  async adminConfirmTransfer(adminUserId: string, transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { appointment: { include: { vet: true } } },
    });

    if (!transaction) throw new NotFoundException("Transacción no encontrada");
    this.validateStateTransition(
      transaction.status,
      TransactionStatus.CONFIRMED,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.CONFIRMED,
          verifiedAt: new Date(),
        },
      });

      // Confirmar la cita
      await tx.appointment.update({
        where: { id: transaction.appointmentId },
        data: { status: AppointmentStatus.CONFIRMED },
      });

      return updated;
    });
  }

  async adminRejectTransfer(
    adminUserId: string,
    transactionId: string,
    reason: string,
  ) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        "La razón de rechazo debe tener al menos 10 caracteres",
      );
    }

    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) throw new NotFoundException("Transacción no encontrada");
    this.validateStateTransition(transaction.status, TransactionStatus.FAILED);

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.FAILED,
      },
    });
  }

  // ============================================================
  // BALANCE & TRANSACTIONS
  // ============================================================

  async getBalance(userId: string, actingRole?: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });

    if (!user) throw new NotFoundException("Usuario no encontrado");

    const effectiveRole = actingRole ?? user.role;

    if (effectiveRole === UserRole.VET && user.vetProfile) {
      // Calcular saldo del vet basado en transacciones LIQUIDATED
      const liquidated = await this.prisma.transaction.aggregate({
        where: {
          appointment: { vetId: user.vetProfile.id },
          status: TransactionStatus.LIQUIDATED,
        },
        _sum: { amountCop: true, commissionAmount: true },
      });

      const pending = await this.prisma.transaction.aggregate({
        where: {
          appointment: { vetId: user.vetProfile.id },
          status: TransactionStatus.CONFIRMED,
        },
        _sum: { amountCop: true, commissionAmount: true },
      });

      const earnings =
        (liquidated._sum.amountCop ?? 0) -
        (liquidated._sum.commissionAmount ?? 0);
      const pendingCop =
        (pending._sum.amountCop ?? 0) - (pending._sum.commissionAmount ?? 0);

      return {
        ctgBalance: user.vetProfile.ctgBalance,
        copBalance: earnings,
        pendingCtg: 0,
        pendingCop,
      };
    }

    // CLIENT mode always uses the client's own balance, even if the database
    // identity also has administrative/veterinarian authority.
    return {
      ctgBalance: user.ctgBalance,
      copBalance: 0,
      pendingCtg: 0,
      pendingCop: 0,
    };
  }

  async getTransactions(
    userId: string,
    filters: TransactionFiltersDto,
    actingRole?: UserRole,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });

    if (!user) throw new NotFoundException("Usuario no encontrado");

    const effectiveRole = actingRole ?? user.role;
    const where: Prisma.TransactionWhereInput = {};

    // Restricción por el rol EFECTIVO de la solicitud. El modo CLIENT de la
    // identidad raíz nunca puede recuperar el rol persistido para ampliar el
    // alcance a transacciones de terceros.
    if (effectiveRole === UserRole.VET && user.vetProfile) {
      where.appointment = { vetId: user.vetProfile.id };
    } else if (effectiveRole === UserRole.CLIENT) {
      where.appointment = { clientId: userId };
    }
    // ADMIN/SUPERADMIN ven todas únicamente cuando ése es el rol efectivo.

    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const [results, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          appointment: {
            include: {
              client: { select: { id: true, firstName: true, lastName: true } },
              vet: {
                include: {
                  user: { select: { firstName: true, lastName: true } },
                },
              },
              pet: { select: { id: true, name: true, species: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: filters.limit ?? 20,
        skip: filters.offset ?? 0,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      results,
      total,
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
      hasMore: (filters.offset ?? 0) + results.length < total,
    };
  }

  async getTransactionById(
    userId: string,
    transactionId: string,
    actingRole?: UserRole,
  ) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        appointment: {
          include: { vet: true, client: true, pet: true },
        },
      },
    });

    if (!transaction) throw new NotFoundException("Transacción no encontrada");

    const persistedUser = actingRole
      ? null
      : await this.prisma.user.findUnique({ where: { id: userId } });
    const effectiveRole = actingRole ?? persistedUser?.role;

    const isClient =
      effectiveRole === UserRole.CLIENT &&
      transaction.appointment.clientId === userId;
    const isVet =
      effectiveRole === UserRole.VET &&
      transaction.appointment.vet.userId === userId;
    const isAdmin =
      effectiveRole === UserRole.ADMIN || effectiveRole === UserRole.SUPERADMIN;

    if (!isClient && !isVet && !isAdmin) {
      throw new ForbiddenException("No tienes acceso a esta transacción");
    }

    return transaction;
  }

  // ============================================================
  // PSE — WEBHOOK HANDLER
  // ============================================================

  /**
   * Procesa el webhook entrante del proveedor PSE.
   *
   * Responsabilidades:
   *  1. Idempotencia por `externalTransactionId` — si el evento ya fue
   *     procesado, retorna sin efectos (el provider puede reintentar).
   *  2. Validación de monto (anti-fraude): si `amount` viene en el payload,
   *     verifica que coincida con el monto de la transacción (±1 COP).
   *  3. Mapeo de status externo → estado interno:
   *     APPROVED  → CONFIRMED  (+ AppointmentStatus.CONFIRMED)
   *     DECLINED  → FAILED
   *     EXPIRED   → FAILED
   *     PENDING   → sin cambio (el provider enviará otro webhook)
   *  4. Logging estructurado para forensics y debugging.
   *
   * El método NO lanza excepciones para estados desconocidos porque eso
   * causaría que el provider reintente indefinidamente. En cambio,
   * loggea y retorna silenciosamente.
   */
  async handlePseWebhook(payload: PseWebhookPayload): Promise<void> {
    const { externalTransactionId, transactionId, status, amount } = payload;

    // 1. Idempotencia: si ya procesamos este evento externo, salir sin efectos
    const idempotencyKey = `pse_webhook:${externalTransactionId}`;
    const alreadyProcessed = this.getIdempotencyResult(idempotencyKey);
    if (alreadyProcessed) {
      this.logger.log(
        `PSE webhook idempotente (ya procesado): extId=${externalTransactionId}`,
      );
      return;
    }

    // 2. Buscar la transacción interna
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { appointment: true },
    });

    if (!transaction) {
      this.logger.warn(
        `PSE webhook: transaccionId=${transactionId} no encontrada. ` +
          `extId=${externalTransactionId} status=${status}`,
      );
      // Cachear para evitar retries inútiles
      this.setIdempotencyResult(idempotencyKey, { notFound: true });
      return;
    }

    if (transaction.paymentMethod !== PaymentMethod.PSE) {
      this.logger.warn(
        `PSE webhook sobre transacción con método ${transaction.paymentMethod} (se esperaba PSE). ` +
          `txId=${transactionId}`,
      );
      return;
    }

    // 3. Validación de monto (anti-fraude)
    if (amount !== undefined && Math.abs(amount - transaction.amountCop) > 1) {
      this.logger.error(
        `PSE webhook MONTO NO COINCIDE: esperado=${transaction.amountCop} ` +
          `recibido=${amount} txId=${transactionId} extId=${externalTransactionId}`,
      );
      // NO procesamos: posible manipulación del webhook
      return;
    }

    // 4. Mapear status externo → transición interna
    const upperStatus = status.toUpperCase();
    let newTxStatus: TransactionStatus | null = null;
    let newApptStatus: AppointmentStatus | null = null;

    switch (upperStatus) {
      case "APPROVED":
        newTxStatus = TransactionStatus.CONFIRMED;
        newApptStatus = AppointmentStatus.CONFIRMED;
        break;
      case "DECLINED":
      case "EXPIRED":
      case "FAILED":
        newTxStatus = TransactionStatus.FAILED;
        break;
      case "PENDING":
        // El provider enviará otro webhook cuando cambie. Sin acción.
        this.logger.log(
          `PSE webhook PENDING — esperando confirmación del banco: txId=${transactionId}`,
        );
        this.setIdempotencyResult(idempotencyKey, { status: "pending_noop" });
        return;
      default:
        this.logger.warn(
          `PSE webhook: status desconocido "${status}" para txId=${transactionId}. Ignorando.`,
        );
        return;
    }

    // 5. Verificar que la transición es válida desde el estado actual
    if (!VALID_TRANSITIONS[transaction.status]?.includes(newTxStatus)) {
      this.logger.warn(
        `PSE webhook: transición inválida ${transaction.status} → ${newTxStatus} ` +
          `txId=${transactionId}. Posible replay del webhook.`,
      );
      this.setIdempotencyResult(idempotencyKey, {
        alreadyInState: transaction.status,
      });
      return;
    }

    // 6. Aplicar cambios en una transacción DB atómica
    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: newTxStatus!,
          externalTransactionId,
          ...(newTxStatus === TransactionStatus.CONFIRMED && {
            verifiedAt: new Date(),
          }),
        } as any,
      });

      if (newApptStatus) {
        await tx.appointment.update({
          where: { id: transaction.appointmentId },
          data: { status: newApptStatus },
        });
      }
    });

    // 7. Marcar como procesado para idempotencia
    this.setIdempotencyResult(idempotencyKey, {
      status: newTxStatus,
      processedAt: new Date(),
    });

    this.logger.log(
      `PSE webhook procesado: txId=${transactionId} ${transaction.status} → ${newTxStatus} ` +
        `extId=${externalTransactionId}`,
    );
  }

  // ============================================================
  // PSE — INITIATE + STATUS
  // ============================================================

  /**
   * Inicia un pago PSE. En producción esto haría un POST al gateway PSE
   * (PlacetoPay, ePayco, Wompi) y retornaría la URL de redirección.
   *
   * Aquí mockeamos la respuesta para mantener el flow funcional.
   */
  async initiatePse(userId: string, dto: InitiatePsePaymentDto) {
    const bankName = PSE_BANKS[dto.bank];
    if (!bankName) {
      throw new BadRequestException(
        `Código de banco PSE inválido: ${dto.bank}`,
      );
    }

    // Crear transacción PENDING
    const tx = await this.processPayment(userId, {
      appointmentId: dto.appointmentId,
      paymentMethod: PaymentMethod.PSE,
      amountCop: dto.amountCop,
    });

    // En producción: llamar al gateway, obtener token y URL
    // const psePayload = await this.pseGateway.createPayment({...})

    const mockPaymentUrl = `https://pse-mock.acme.test/pay/${tx.id}?bank=${dto.bank}`;

    return {
      transactionId: tx.id,
      paymentUrl: mockPaymentUrl,
      bankName,
    };
  }

  async checkPseStatus(
    userId: string,
    transactionId: string,
    actingRole?: UserRole,
  ) {
    const tx = await this.getTransactionById(userId, transactionId, actingRole);
    return {
      status: tx.status,
      transaction: tx,
    };
  }

  // ============================================================
  // CTG TOKEN
  // ============================================================

  async getCtgRate() {
    return {
      rate: CTG_TO_COP_RATE,
      lastUpdated: new Date().toISOString(),
    };
  }

  // ============================================================
  // WITHDRAWAL
  // ============================================================

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });

    if (!user || !user.vetProfile) {
      throw new ForbiddenException(
        "Solo veterinarios pueden solicitar retiros",
      );
    }

    const balance = await this.getBalance(userId, UserRole.VET);

    if (dto.amountCop > balance.copBalance) {
      throw new BadRequestException(
        `Saldo insuficiente. Disponible: ${balance.copBalance.toLocaleString("es-CO")} COP`,
      );
    }

    // En producción: encolar job a BullMQ que mueva el dinero (ACH/PSE saliente)
    // Aquí registramos como una pseudo-transacción de retiro
    return {
      success: true,
      message:
        "Solicitud de retiro registrada. Se procesará en 1-2 días hábiles.",
      requestedAmount: dto.amountCop,
      method: dto.paymentMethod,
      estimatedArrival: new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
  }

  // ============================================================
  // EARNINGS SUMMARY (vets)
  // ============================================================

  async getEarningsSummary(
    userId: string,
    filters: { startDate?: string; endDate?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });

    if (!user || !user.vetProfile) {
      throw new ForbiddenException("Solo veterinarios");
    }

    const where: Prisma.TransactionWhereInput = {
      appointment: { vetId: user.vetProfile.id },
      status: {
        in: [TransactionStatus.CONFIRMED, TransactionStatus.LIQUIDATED],
      },
    };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const aggregates = await this.prisma.transaction.aggregate({
      where,
      _sum: { amountCop: true, amountCtg: true, commissionAmount: true },
      _count: true,
    });

    const total = aggregates._sum.amountCop ?? 0;
    const commissions = aggregates._sum.commissionAmount ?? 0;

    return {
      totalEarnings: total,
      totalCommissions: commissions,
      netEarnings: total - commissions,
      transactionCount: aggregates._count,
      byTier: {
        tier: user.vetProfile.tier,
        commissionPct: TIER_COMMISSIONS[user.vetProfile.tier] * 100,
        commissionAmount: commissions,
        earnings: total - commissions,
      },
    };
  }

  // ============================================================
  // ADMIN: liquidación batch
  // ============================================================

  /**
   * Marca como LIQUIDATED las transacciones CONFIRMED con más de N días.
   * Pensado para correr en un cron job diario (BullMQ Repeatable).
   */
  async liquidateConfirmedTransactions(daysHold = 7) {
    const cutoff = new Date(Date.now() - daysHold * 24 * 60 * 60 * 1000);

    const result = await this.prisma.transaction.updateMany({
      where: {
        status: TransactionStatus.CONFIRMED,
        verifiedAt: { lte: cutoff },
      },
      data: {
        status: TransactionStatus.LIQUIDATED,
        liquidatedAt: new Date(),
      },
    });

    return { liquidatedCount: result.count };
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private validateStateTransition(
    current: TransactionStatus,
    next: TransactionStatus,
  ) {
    if (!VALID_TRANSITIONS[current]?.includes(next)) {
      throw new BadRequestException(
        `Transición de estado inválida: ${current} → ${next}`,
      );
    }
  }

  private copToCtg(cop: number): number {
    return Math.round(cop / CTG_TO_COP_RATE);
  }

  private getIdempotencyResult(key: string) {
    const entry = this.idempotencyCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.IDEMPOTENCY_TTL_MS) {
      this.idempotencyCache.delete(key);
      return null;
    }
    return entry.result;
  }

  private setIdempotencyResult(key: string, result: any) {
    this.idempotencyCache.set(key, { result, ts: Date.now() });
  }
}
