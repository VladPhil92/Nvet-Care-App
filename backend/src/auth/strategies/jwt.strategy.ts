import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

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
      throw new UnauthorizedException('User not found');
    }
    if (!user.isActive) {
      throw new ForbiddenException('Account deactivated');
    }

    // Si la contraseña cambió tras emitir el token (passwordChangedAt > iat),
    // invalidar el access token actual y forzar re-login.
    if (
      user.passwordChangedAt &&
      payload.iat &&
      user.passwordChangedAt.getTime() / 1000 > payload.iat
    ) {
      throw new UnauthorizedException('Token invalidated by password change');
    }

    // Return user object (attached to request.user)
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      vetProfileId: user.vetProfile?.id,
    };
  }
}
