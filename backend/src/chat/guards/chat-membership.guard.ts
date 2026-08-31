import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * ChatMembershipGuard — valida que `req.user.id` participa en la cita bajo
 * el rol EFECTIVO de la solicitud.
 *
 * Diseño:
 *  - Lee `appointmentId` desde `req.params.appointmentId` por defecto.
 *  - Si la ruta usa `messageId` en lugar de `appointmentId` (ej: report,
 *    delete), el guard hace lookup del mensaje y resuelve el appointmentId.
 *  - ADMIN/SUPERADMIN tienen acceso global únicamente cuando ese es el rol
 *    efectivo de la solicitud.
 *  - CLIENT solo puede actuar como el cliente de la cita; VET solo como el
 *    veterinario. Esto evita que una identidad con múltiples relaciones
 *    recupere autoridad lateral durante un modo request-scoped.
 *  - Cachea el appointment en `req.appointment` para evitar otra query
 *    en el handler.
 */
@Injectable()
export class ChatMembershipGuard implements CanActivate {
  private readonly logger = new Logger(ChatMembershipGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException("Autenticación requerida");
    }

    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN) {
      return true;
    }

    // Resolver appointmentId desde params (caso normal) o desde messageId
    let appointmentId = req.params?.appointmentId as string | undefined;

    if (!appointmentId && req.params?.messageId) {
      const message = await this.prisma.message.findUnique({
        where: { id: req.params.messageId },
        select: { appointmentId: true },
      });
      if (!message) {
        throw new NotFoundException("Mensaje no encontrado");
      }
      appointmentId = message.appointmentId;
    }

    if (!appointmentId) {
      throw new BadRequestException(
        "appointmentId requerido para validar membresía del chat",
      );
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        vet: { select: { userId: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException("Cita no encontrada");
    }

    const isClient =
      user.role === UserRole.CLIENT && appointment.clientId === user.id;
    const isVet =
      user.role === UserRole.VET && appointment.vet.userId === user.id;

    if (!isClient && !isVet) {
      this.logger.warn(
        `Acceso a chat denegado: userId=${user.id} role=${user.role} ` +
          `appointmentId=${appointmentId}`,
      );
      throw new ForbiddenException("No eres participante de este chat");
    }

    // Cachear en req para evitar re-query en el handler
    req.appointment = appointment;
    req.chatRole = isClient ? "CLIENT" : "VET";

    return true;
  }
}
