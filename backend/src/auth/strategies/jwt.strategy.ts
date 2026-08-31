import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { resolveEffectiveNvetRole } from "../security/canonical-superadmin";

interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: JwtPayload) {
    // Verify user still exists & active. Always re-fetch para tener
    // el estado actual de `emailVerified`, `isActive` y `passwordChangedAt`,
    // ya que el JWT es snapshot del momento de emisión.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        vetProfile: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    if (!user.isActive) {
      throw new ForbiddenException("Account deactivated");
    }

    // Si la contraseña cambió tras emitir el token (passwordChangedAt > iat),
    // invalidar el access token actual y forzar re-login.
    if (
      user.passwordChangedAt &&
      payload.iat &&
      user.passwordChangedAt.getTime() / 1000 > payload.iat
    ) {
      throw new UnauthorizedException("Token invalidated by password change");
    }

    // Root authorization is derived from the verified CTG One identity link,
    // not from a mutable browser claim and not solely from the database role.
    // The canonical linked identity is promoted to SUPERADMIN at request time;
    // any accidentally-labelled SUPERADMIN row for another identity is
    // downgraded to ADMIN before RolesGuard evaluates permissions.
    const effectiveRole = resolveEffectiveNvetRole(user);

    // Return user object (attached to request.user)
    return {
      id: user.id,
      email: user.email,
      role: effectiveRole,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      vetProfileId: user.vetProfile?.id,
    };
  }
}
