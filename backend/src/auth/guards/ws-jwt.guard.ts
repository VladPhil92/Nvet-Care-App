import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { WsException } from "@nestjs/websockets";
import { Socket } from "socket.io";
import { PrismaService } from "../../prisma/prisma.service";

export interface AuthenticatedSocket extends Socket {
  user: {
    id: string;
    email: string;
    role: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
  };
}

/**
 * WsJwtGuard — autenticación y revalidación de WebSocket.
 *
 * Diferencias vs JwtAuthGuard:
 *  - Lee el token desde `handshake.auth.token` (socket.io).
 *  - Verifica la firma y re-consulta `isActive`, `passwordChangedAt`, rol y
 *    estado de seguridad en cada evento protegido por el guard.
 *  - Refresca `client.user` con el estado actual en lugar de confiar en un
 *    snapshot cacheado durante el handshake.
 *
 * La revalidación por evento es deliberada: una eliminación de cuenta, cambio
 * de contraseña o desactivación debe invalidar también sockets que ya estaban
 * conectados. Cuando detectamos ese estado, cerramos el socket inmediatamente.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: AuthenticatedSocket = context.switchToWs().getClient();

    try {
      const token = client.handshake?.auth?.token;
      if (!token) {
        throw new WsException("No token provided");
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          emailVerified: true,
          twoFactorEnabled: true,
          isActive: true,
          passwordChangedAt: true,
        },
      });

      if (!user) {
        this.disconnect(client);
        throw new WsException("User not found");
      }
      if (!user.isActive) {
        this.disconnect(client);
        throw new WsException("Account deactivated");
      }
      if (
        user.passwordChangedAt &&
        payload.iat &&
        user.passwordChangedAt.getTime() / 1000 > payload.iat
      ) {
        this.disconnect(client);
        throw new WsException("Token invalidated by password change");
      }

      client.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      };

      return true;
    } catch (error) {
      if (error instanceof WsException) throw error;
      this.disconnect(client);
      throw new WsException("Invalid token");
    }
  }

  private disconnect(client: Socket): void {
    try {
      client.disconnect(true);
    } catch {
      // The authorization decision still fails closed even if the transport is
      // already tearing down and Socket.IO cannot perform another disconnect.
    }
  }
}

/**
 * WsEmailVerifiedGuard — bloquea eventos de WebSocket si el usuario no
 * tiene email verificado. Usado en handlers que producen contenido visible
 * a otros (mensajes, share-price) para anti-abuso de cuentas recién creadas.
 *
 * Asume que `WsJwtGuard` acaba de revalidar `client.user.emailVerified`.
 * ADMIN se considera implícitamente verificado.
 */
@Injectable()
export class WsEmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client: AuthenticatedSocket = context.switchToWs().getClient();
    const user = client.user;
    if (!user) {
      throw new WsException("Authentication required");
    }
    if (user.role === "ADMIN") return true;
    if (user.emailVerified) return true;
    throw new WsException(
      "Verifica tu correo electrónico para enviar mensajes.",
    );
  }
}
