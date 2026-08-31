import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  AdminUsersFiltersDto,
  AuditLogFiltersDto,
  ReviewVetVerificationDto,
  UpdateUserStatusDto,
  UpdateVetStatusDto,
} from "./dto/admin.dto";
import { GovernanceService } from "./governance.service";

@Controller("admin/governance")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get("overview")
  async getOverview() {
    return this.governanceService.getOverview();
  }

  @Get("users")
  async getUsers(@Query() filters: AdminUsersFiltersDto) {
    return this.governanceService.getUsers(filters);
  }

  @Patch("users/:id/status")
  async updateUserStatus(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.governanceService.updateUserStatus(
      req.user.id,
      id,
      dto,
      this.extractCtx(req),
    );
  }

  @Patch("veterinarians/:id/verification")
  async reviewVetVerification(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewVetVerificationDto,
  ) {
    return this.governanceService.reviewVetVerification(
      req.user.id,
      id,
      dto,
      this.extractCtx(req),
    );
  }

  @Patch("veterinarians/:id/status")
  async updateVetStatus(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateVetStatusDto,
  ) {
    return this.governanceService.updateVetStatus(
      req.user.id,
      id,
      dto,
      this.extractCtx(req),
    );
  }

  @Get("audit-log")
  async getAuditLog(@Query() filters: AuditLogFiltersDto) {
    return this.governanceService.getAuditLog(filters);
  }

  private extractCtx(req: any): {
    ip?: string;
    userAgent?: string;
    role?: string;
  } {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress;
    return {
      ip,
      userAgent: req.headers["user-agent"],
      role: req.user?.role,
    };
  }
}
