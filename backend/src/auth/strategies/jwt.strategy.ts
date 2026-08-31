import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  resolveEffectiveNvetRole,
  resolveNvetRequestRole,
} from "../security/canonical-superadmin";

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
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload) {
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
    const authorityRole = resolveEffectiveNvetRole(user);

    // The only role-switching capability is a request-scoped CLIENT mode for
    // the canonical root. The hint cannot promote anybody and cannot request
    // ADMIN/VET/SUPERADMIN. CTG One emits this header server-to-server from an
    // httpOnly mode cookie; even if another client sends it manually, it is
    // ignored unless the authenticated DB+CTG identity resolves SUPERADMIN.
    const requestedRole = req?.headers?.["x-nvet-acting-role"];
    const effectiveRole = resolveNvetRequestRole(user, requestedRole);

    // Return user object (attached to request.user). `authorityRole` preserves
    // the root's real authority for audit/UX while `role` is the role that all
    // guards/services must enforce for this request.
    return {
      id: user.id,
      email: user.email,
      role: effectiveRole,
      authorityRole,
      isRoleModeActive:
        authorityRole === UserRole.SUPERADMIN &&
        effectiveRole === UserRole.CLIENT,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      vetProfileId: user.vetProfile?.id,
    };
  }
}
