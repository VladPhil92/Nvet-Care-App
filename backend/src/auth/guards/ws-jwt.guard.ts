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
 * WsJwtGuard — autenticación de WebSocket connections.
 *
 * Diferencias vs JwtAuthGuard:
 *  - Lee el token desde `handshake.auth.token` (socket.io) en vez de Authorization header.
 *  - Re-consulta la DB para `emailVerified` + `isActive` (igual que jwt.strategy.ts en HTTP).
 *    Esto asegura que un usuario que verifica email en una pestaña no se vea bloqueado
 *    en su WebSocket de otra pestaña por payload viejo.
 *  - Cachea el lookup en `client.user` para que los handlers no re-consulten.
 *
 * El guard se ejecuta UNA SOLA VEZ por conexión (en el handshake). Para
 * rate-limit por evento o checks adicionales (email-verified en sendMessage),
 * los handlers deben usar `WsEmailVerifiedGuard` además.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: AuthenticatedSocket = context.switchToWs().getClient();

      // Si el guard ya se ejecutó antes en esta conexión, reusar el cache.
      if (client.user && client.user.id) {
        return true;
      }

      const token = client.handshake?.auth?.token;
      if (!token) {
        throw new WsException("No token provided");
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      });

      // Re-consultar DB para tener emailVerified + isActive frescos
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
        throw new WsException("User not found");
      }
      if (!user.isActive) {
        throw new WsException("Account deactivated");
      }
      // Si la contraseña cambió tras emitir el token, invalidar
      if (
        user.passwordChangedAt &&
        payload.iat &&
        user.passwordChangedAt.getTime() / 1000 > payload.iat
      ) {
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
      throw new WsException("Invalid token");
    }
  }
}

/**
 * WsEmailVerifiedGuard — bloquea eventos de WebSocket si el usuario no
 * tiene email verificado. Usado en handlers que producen contenido visible
 * a otros (mensajes, share-price) para anti-abuso de cuentas recién creadas.
 *
 * Asume que `WsJwtGuard` ya pobló `client.user.emailVerified`.
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
