import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  Prisma,
  AppointmentStatus,
  TransactionStatus,
  PaymentMethod,
  VetTier,
  AuditAction,
  AuditSeverity,
} from "@prisma/client";
import { AuditService } from "../common/audit/audit.service";
import {
  MetricsFiltersDto,
  AdminTransactionFiltersDto,
  ResolveDisputeDto,
  UpdateVetTierDto,
  ExportFiltersDto,
  AdminVetsFiltersDto,
  AdminAppointmentsFiltersDto,
} from "./dto/admin.dto";

/**
 * Contexto del admin que ejecuta la acción. Lo recibimos del controller
 * para enriquecer los audit logs con IP/UA y permitir forensics post-incidente.
 */
export interface AdminActionContext {
  ip?: string;
  userAgent?: string;
  role?: string;
}

/**
 * AdminService — operaciones agregadas sobre toda la plataforma.
 *
 * Diseño:
 *  - Queries optimizadas con `groupBy` y `aggregate` (no traer registros completos
 *    cuando solo necesitamos counts/sums)
 *  - Pagination obligatoria en listados (default 20, max 100)
 *  - Cache-friendly: estructuras de respuesta predecibles para integrar con Redis
 */
@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ============================================================
  // METRICS DASHBOARD
  // ============================================================

  /**
   * Métricas globales para el AdminDashboard.
   * Una sola llamada que retorna todos los KPIs principales.
   */
  async getMetrics(filters: MetricsFiltersDto) {
    const dateRange = this.buildDateRange(filters.startDate, filters.endDate);

    const [
      totalUsers,
      totalVets,
      verifiedVets,
      totalAppointments,
      completedAppointments,
      transactionAggregates,
      pendingTransfers,
      disputedTransactions,
      tierDistribution,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.vetProfile.count(),
      this.prisma.vetProfile.count({ where: { isVerified: true } }),
      this.prisma.appointment.count({
        where: dateRange ? { createdAt: dateRange } : undefined,
      }),
      this.prisma.appointment.count({
        where: {
          status: AppointmentStatus.COMPLETED,
          ...(dateRange && { createdAt: dateRange }),
        },
      }),
      this.prisma.transaction.aggregate({
        where: {
          status: {
            in: [TransactionStatus.CONFIRMED, TransactionStatus.LIQUIDATED],
          },
          ...(dateRange && { createdAt: dateRange }),
        },
        _sum: { amountCop: true, commissionAmount: true },
        _count: true,
      }),
      this.prisma.transaction.count({
        where: {
          paymentMethod: PaymentMethod.TRANSFER,
          status: {
            in: [TransactionStatus.PENDING, TransactionStatus.VERIFYING],
          },
        },
      }),
      this.prisma.transaction.count({
        where: { status: TransactionStatus.DISPUTED },
      }),
      this.prisma.vetProfile.groupBy({
        by: ["tier"],
        _count: true,
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        vets: { total: totalVets, verified: verifiedVets },
      },
      appointments: {
        total: totalAppointments,
        completed: completedAppointments,
        completionRate:
          totalAppointments > 0
            ? Math.round((completedAppointments / totalAppointments) * 100)
            : 0,
      },
      revenue: {
        gross: transactionAggregates._sum.amountCop ?? 0,
        commissions: transactionAggregates._sum.commissionAmount ?? 0,
        transactionCount: transactionAggregates._count,
      },
      alerts: {
        pendingTransfers,
        disputedTransactions,
      },
      tierDistribution: tierDistribution.reduce(
        (acc, t) => ({ ...acc, [t.tier]: t._count }),
        {} as Record<VetTier, number>,
      ),
    };
  }

  // ============================================================
  // TRANSACTIONS LIST (admin view, sin restricción de ownership)
  // ============================================================

  async getTransactions(filters: AdminTransactionFiltersDto) {
    const where: Prisma.TransactionWhereInput = {};

    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    const dateRange = this.buildDateRange(filters.startDate, filters.endDate);
    if (dateRange) where.createdAt = dateRange;

    if (filters.vetName) {
      where.appointment = {
        vet: {
          user: {
            OR: [
              { firstName: { contains: filters.vetName, mode: "insensitive" } },
              { lastName: { contains: filters.vetName, mode: "insensitive" } },
            ],
          },
        },
      };
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [results, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          appointment: {
            include: {
              client: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
              vet: {
                include: {
                  user: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    };
  }

  // ============================================================
  // TRANSFER TRACKING (panel de transferencias pendientes)
  // ============================================================

  async getTransferTracking() {
    const transfers = await this.prisma.transaction.findMany({
      where: {
        paymentMethod: PaymentMethod.TRANSFER,
        status: {
          in: [TransactionStatus.PENDING, TransactionStatus.VERIFYING],
        },
      },
      include: {
        appointment: {
          include: {
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
            vet: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Agregar métrica de tiempo en cola
    const now = Date.now();
    return transfers.map((tx) => ({
      ...tx,
      waitingMinutes: Math.floor((now - tx.createdAt.getTime()) / 60000),
    }));
  }

  // ============================================================
  // PAYMENT METHOD STATS
  // ============================================================

  async getPaymentMethodStats(filters: MetricsFiltersDto) {
    const dateRange = this.buildDateRange(filters.startDate, filters.endDate);

    const stats = await this.prisma.transaction.groupBy({
      by: ["paymentMethod", "status"],
      where: dateRange ? { createdAt: dateRange } : undefined,
      _count: true,
      _sum: { amountCop: true },
    });

    // Pivotear a estructura por método
    const result: Record<
      string,
      { total: number; amount: number; byStatus: Record<string, number> }
    > = {};

    for (const row of stats) {
      const method = row.paymentMethod;
      if (!result[method]) {
        result[method] = { total: 0, amount: 0, byStatus: {} };
      }
      result[method].total += row._count;
      result[method].amount += row._sum.amountCop ?? 0;
      result[method].byStatus[row.status] = row._count;
    }

    return result;
  }

  // ============================================================
  // VETS MANAGEMENT
  // ============================================================

  async getVeterinarians(filters: AdminVetsFiltersDto) {
    const where: Prisma.VetProfileWhereInput = {};
    if (filters.tier) where.tier = filters.tier;
    if (filters.verificationStatus) {
      where.verificationStatus = filters.verificationStatus as any;
    }

    if (filters.search) {
      where.user = {
        OR: [
          { firstName: { contains: filters.search, mode: "insensitive" } },
          { lastName: { contains: filters.search, mode: "insensitive" } },
          { email: { contains: filters.search, mode: "insensitive" } },
        ],
      };
    }

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [results, total] = await Promise.all([
      this.prisma.vetProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              avatar: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              appointments: true,
              reviews: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.vetProfile.count({ where }),
    ]);

    return {
      results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    };
  }

  async updateVetTier(
    adminUserId: string,
    vetId: string,
    dto: UpdateVetTierDto,
    ctx: AdminActionContext = {},
  ) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { id: vetId },
    });
    if (!vet) throw new NotFoundException("Veterinario no encontrado");

    // No-op si el tier no cambia: evita ruido en el audit log
    if (vet.tier === dto.tier) {
      return vet;
    }

    const updated = await this.prisma.vetProfile.update({
      where: { id: vetId },
      data: { tier: dto.tier },
    });

    await this.auditService.logMutation(
      {
        id: adminUserId,
        role: ctx.role ?? "ADMIN",
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      AuditAction.VET_TIER_CHANGED,
      { type: "VetProfile", id: vetId },
      { tier: vet.tier },
      { tier: dto.tier },
      dto.reason ?? "admin_tier_update",
    );

    return updated;
  }

  // ============================================================
  // APPOINTMENTS LIST (admin view)
  // ============================================================

  async getAppointments(filters: AdminAppointmentsFiltersDto) {
    const where: Prisma.AppointmentWhereInput = {};
    if (filters.status) where.status = filters.status;

    const dateRange = this.buildDateRange(filters.startDate, filters.endDate);
    if (dateRange) where.date = dateRange;

    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const [results, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        include: {
          client: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          vet: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          pet: { select: { id: true, name: true, species: true } },
          transaction: {
            select: { id: true, status: true, paymentMethod: true },
          },
        },
        orderBy: { date: "desc" },
        take: limit,
        skip: offset,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return {
      results,
      total,
      limit,
      offset,
      hasMore: offset + results.length < total,
    };
  }

  // ============================================================
  // DISPUTE RESOLUTION
  // ============================================================

  async resolveDispute(
    adminUserId: string,
    transactionId: string,
    dto: ResolveDisputeDto,
    ctx: AdminActionContext = {},
  ) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { appointment: true },
    });

    if (!tx) throw new NotFoundException("Transacción no encontrada");
    if (tx.status !== TransactionStatus.DISPUTED) {
      throw new BadRequestException(
        "Solo se pueden resolver transacciones en disputa",
      );
    }

    const updated = await this.prisma.$transaction(async (prisma) => {
      let newStatus: TransactionStatus;
      let appointmentStatus: AppointmentStatus | null = null;

      switch (dto.resolution) {
        case "CONFIRM":
          newStatus = TransactionStatus.LIQUIDATED;
          appointmentStatus = AppointmentStatus.COMPLETED;
          break;
        case "REFUND":
        case "CANCEL":
          newStatus = TransactionStatus.FAILED;
          appointmentStatus = AppointmentStatus.CANCELLED;
          break;
        default:
          throw new BadRequestException("Resolución inválida");
      }

      const result = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: newStatus,
          ...(newStatus === TransactionStatus.LIQUIDATED && {
            liquidatedAt: new Date(),
          }),
        },
      });

      if (appointmentStatus) {
        await prisma.appointment.update({
          where: { id: tx.appointmentId },
          data: {
            status: appointmentStatus,
            notes: `[Admin: ${dto.resolution}] ${dto.notes}`,
          },
        });
      }

      return result;
    });

    // Audit fuera de la transaction (no queremos que un fallo del audit
    // rollback la resolución; AuditService ya silencia errores internos).
    await this.auditService.log({
      actor: {
        id: adminUserId,
        role: ctx.role ?? "ADMIN",
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
      action: AuditAction.DISPUTE_RESOLVED,
      severity: AuditSeverity.CRITICAL,
      targetType: "Transaction",
      targetId: transactionId,
      beforeData: { status: tx.status },
      afterData: { status: updated.status },
      reason: dto.notes ?? `dispute_resolution_${dto.resolution.toLowerCase()}`,
      metadata: {
        resolution: dto.resolution,
        appointmentId: tx.appointmentId,
        amountCop: tx.amountCop,
      },
    });

    return updated;
  }

  // ============================================================
  // EXPORTS (CSV)
  // ============================================================

  /**
   * Genera un export de transacciones.
   *
   * Implementación CSV para mantener cero dependencias externas.
   * Para XLSX, en producción agregar `exceljs` y devolver Buffer + Content-Type.
   */
  async exportTransactions(
    filters: ExportFiltersDto,
    adminUserId?: string,
    ctx: AdminActionContext = {},
  ): Promise<{
    filename: string;
    contentType: string;
    body: string;
  }> {
    const where: Prisma.TransactionWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

    const dateRange = this.buildDateRange(filters.startDate, filters.endDate);
    if (dateRange) where.createdAt = dateRange;

    const transactions = await this.prisma.transaction.findMany({
      where,
      include: {
        appointment: {
          include: {
            client: {
              select: { firstName: true, lastName: true, email: true },
            },
            vet: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10000, // hard cap export
    });

    if (filters.format === "CSV") {
      const csv = this.toCsv(transactions);

      // Audit data exfiltration: ¡importante para compliance Habeas Data!
      // Sabemos quién descargó qué rango de datos y desde dónde.
      if (adminUserId) {
        await this.auditService.log({
          actor: {
            id: adminUserId,
            role: ctx.role ?? "ADMIN",
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          },
          action: AuditAction.CONFIG_CHANGED,
          severity: AuditSeverity.WARN,
          targetType: "Transaction",
          reason: "transactions_export_csv",
          metadata: {
            recordCount: transactions.length,
            filters: {
              startDate: filters.startDate ?? null,
              endDate: filters.endDate ?? null,
              status: filters.status ?? null,
              paymentMethod: filters.paymentMethod ?? null,
            },
          },
        });
      }

      return {
        filename: `transacciones_${Date.now()}.csv`,
        contentType: "text/csv; charset=utf-8",
        body: csv,
      };
    }

    // XLSX placeholder
    throw new BadRequestException(
      "Export XLSX no disponible aún. Use format=CSV (XLSX requiere paquete exceljs).",
    );
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private buildDateRange(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (startDate) range.gte = new Date(startDate);
    if (endDate) range.lte = new Date(endDate);
    return range;
  }

  /**
   * Generador CSV simple sin dependencias.
   * Maneja escape de comas, comillas y saltos de línea.
   */
  private toCsv(transactions: any[]): string {
    const headers = [
      "id",
      "fecha",
      "cliente",
      "email_cliente",
      "veterinario",
      "monto_cop",
      "monto_ctg",
      "comision_pct",
      "comision_cop",
      "metodo_pago",
      "status",
      "transfer_code",
    ];

    const escape = (v: any): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines = [headers.join(",")];

    for (const tx of transactions) {
      const client = tx.appointment?.client;
      const vetUser = tx.appointment?.vet?.user;
      lines.push(
        [
          tx.id,
          tx.createdAt.toISOString(),
          client
            ? `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim()
            : "",
          client?.email ?? "",
          vetUser
            ? `${vetUser.firstName ?? ""} ${vetUser.lastName ?? ""}`.trim()
            : "",
          tx.amountCop,
          tx.amountCtg ?? "",
          tx.commissionPct,
          tx.commissionAmount,
          tx.paymentMethod,
          tx.status,
          tx.transferCode ?? "",
        ]
          .map(escape)
          .join(","),
      );
    }

    return lines.join("\n");
  }
}
