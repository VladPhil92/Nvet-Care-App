import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditAction, AuditSeverity, Prisma } from '@prisma/client'

/**
 * AuditService — registro append-only de acciones críticas.
 *
 * Filosofía:
 *  - Nunca update/delete de entries existentes (immutable log).
 *  - Cada acción incluye actor, target, before/after diff.
 *  - Errores de logging NO deben romper la operación principal:
 *    si el insert falla, solo loggeamos warning y seguimos.
 *
 * Casos de uso:
 *  - Compliance / auditoría legal (Habeas Data en Colombia)
 *  - Forensics post-incidente
 *  - Detección de comportamiento anómalo (ej: 1 admin aprueba 100 vets/día)
 *  - Responder a "¿quién cambió X?" en disputas
 */

interface ActorContext {
  id?: string
  role?: string
  ip?: string
  userAgent?: string
}

interface AuditEntry {
  actor?: ActorContext
  action: AuditAction
  severity?: AuditSeverity
  targetType?: string
  targetId?: string
  beforeData?: unknown
  afterData?: unknown
  reason?: string
  metadata?: Record<string, unknown>
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una entrada en el audit log.
   * No throws — los errores se loggean pero no rompen la operación principal.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actor?.id,
          actorRole: entry.actor?.role,
          actorIp: this.normalizeIp(entry.actor?.ip),
          actorUserAgent: this.truncate(entry.actor?.userAgent, 500),
          action: entry.action,
          severity: entry.severity ?? AuditSeverity.INFO,
          targetType: entry.targetType,
          targetId: entry.targetId,
          beforeData: this.sanitizeJson(entry.beforeData),
          afterData: this.sanitizeJson(entry.afterData),
          reason: this.truncate(entry.reason, 1000),
          metadata: this.sanitizeJson(entry.metadata),
        },
      })
    } catch (e) {
      // Log local pero no rethrow: la operación principal no debe fallar
      this.logger.warn(
        `Audit log insert failed for action=${entry.action}: ${(e as Error).message}`,
      )
    }
  }

  /**
   * Helper: registra una mutación con diff automático entre before y after.
   */
  async logMutation<T extends Record<string, unknown>>(
    actor: ActorContext,
    action: AuditAction,
    target: { type: string; id: string },
    before: T,
    after: T,
    reason?: string,
  ): Promise<void> {
    await this.log({
      actor,
      action,
      severity: AuditSeverity.INFO,
      targetType: target.type,
      targetId: target.id,
      beforeData: this.diffOnlyChanged(before, after, 'before'),
      afterData: this.diffOnlyChanged(before, after, 'after'),
      reason,
    })
  }

  /**
   * Búsqueda paginada del audit log (admin only).
   */
  async query(filters: {
    actorId?: string
    action?: AuditAction
    severity?: AuditSeverity
    targetType?: string
    targetId?: string
    startDate?: Date
    endDate?: Date
    limit?: number
    offset?: number
  }) {
    const where: Prisma.AuditLogWhereInput = {}
    if (filters.actorId) where.actorId = filters.actorId
    if (filters.action) where.action = filters.action
    if (filters.severity) where.severity = filters.severity
    if (filters.targetType) where.targetType = filters.targetType
    if (filters.targetId) where.targetId = filters.targetId

    if (filters.startDate || filters.endDate) {
      where.createdAt = {}
      if (filters.startDate) where.createdAt.gte = filters.startDate
      if (filters.endDate) where.createdAt.lte = filters.endDate
    }

    const limit = Math.min(filters.limit ?? 50, 200)
    const offset = filters.offset ?? 0

    const [results, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ])

    return { results, total, limit, offset, hasMore: offset + results.length < total }
  }

  // ----------------------------------------------------------
  // PRIVATE HELPERS
  // ----------------------------------------------------------

  /**
   * Normaliza IP: extrae primera de X-Forwarded-For si viene una lista,
   * y trunca para evitar valores anómalos.
   */
  private normalizeIp(ip?: string): string | undefined {
    if (!ip) return undefined
    const first = ip.split(',')[0].trim()
    return first.slice(0, 45) // IPv6 max length
  }

  private truncate(str?: string, max = 500): string | undefined {
    if (!str) return undefined
    return str.length > max ? str.slice(0, max) + '…' : str
  }

  /**
   * Sanitiza objetos JSON: elimina campos sensibles antes de persistir.
   */
  private sanitizeJson(obj: unknown): Prisma.InputJsonValue | undefined {
    if (obj === undefined || obj === null) return undefined

    const SENSITIVE_KEYS = new Set([
      'password',
      'passwordHash',
      'refreshToken',
      'accessToken',
      'cvv',
      'creditCard',
      'ssn',
    ])

    const seen = new WeakSet()

    const clean = (v: unknown): unknown => {
      if (v === null || v === undefined) return v
      if (typeof v !== 'object') return v
      if (seen.has(v as object)) return '[Circular]'
      seen.add(v as object)

      if (Array.isArray(v)) return v.map(clean)
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(k)) {
          out[k] = '[REDACTED]'
        } else {
          out[k] = clean(val)
        }
      }
      return out
    }

    return clean(obj) as Prisma.InputJsonValue
  }

  /**
   * Reduce el diff a solo los campos que cambiaron.
   * Esto mantiene el audit log compacto y legible.
   */
  private diffOnlyChanged(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    side: 'before' | 'after',
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
    for (const k of keys) {
      const a = before?.[k]
      const b = after?.[k]
      const changed = JSON.stringify(a) !== JSON.stringify(b)
      if (changed) {
        result[k] = side === 'before' ? a : b
      }
    }
    return result
  }
}
