import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../decorators/roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const userRole = user?.role as UserRole | undefined;

    if (!userRole) {
      return false;
    }

    // SUPERADMIN enters through the same public authentication flow and only
    // inherits protected ADMIN capabilities. VET/CLIENT permissions remain
    // explicitly scoped to those roles.
    if (userRole === UserRole.SUPERADMIN) {
      return (
        requiredRoles.includes(UserRole.SUPERADMIN) ||
        requiredRoles.includes(UserRole.ADMIN)
      );
    }

    return requiredRoles.includes(userRole);
  }
}
