import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * ChatMembershipGuard — valida que `req.user.id` es el cliente o el vet
 * de la cita asociada al chat (`appointmentId` en el path o body).
 *
 * Diseño:
 *  - Lee `appointmentId` desde `req.params.appointmentId` por defecto.
 *  - Si la ruta usa `messageId` en lugar de `appointmentId` (ej: report,
 *    delete), el guard hace lookup del mensaje y resuelve el appointmentId.
 *  - ADMIN siempre tiene acceso (auditoría de chats).
 *  - Cachea el appointment en `req.appointment` para evitar otra query
 *    en el handler.
 *
 * Por qué un guard y no inline:
 *  - Single source of truth: la lógica de membership vive en un sólo lugar.
 *  - Mejor testeabilidad: se puede mockear `PrismaService` sin tocar el controller.
 *  - DI consistente: el guard se inyecta como provider, fácil de extender
 *    (ej: agregar audit en accesos no autorizados).
 *
 * Uso:
 *   @UseGuards(JwtAuthGuard, ChatMembershipGuard)
 *   @Get(':appointmentId/messages')
 *   async getMessages(@Param('appointmentId') id: string) { ... }
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

    // ADMIN siempre puede acceder a cualquier chat (auditoría / arbitraje)
    if (user.role === "ADMIN") return true;

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

    const isClient = appointment.clientId === user.id;
    const isVet = appointment.vet.userId === user.id;

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
