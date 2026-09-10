import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  CreateVetRecruitmentLeadDto,
  ScheduleVetRecruitmentFollowUpDto,
  UpdateVetRecruitmentStageDto,
} from "./dto/vet-recruitment.dto";
import {
  RecruitmentActor,
  VetRecruitmentService,
} from "./vet-recruitment.service";

@Controller("recruitment/vets")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
export class VetRecruitmentController {
  constructor(private readonly recruitment: VetRecruitmentService) {}

  @Get()
  getSnapshot(@Query("marketDaneCode") marketDaneCode?: string) {
    return this.recruitment.getAdminSnapshot(
      marketDaneCode?.trim() || undefined,
    );
  }

  @Post()
  createLead(@Request() req, @Body() dto: CreateVetRecruitmentLeadDto) {
    return this.recruitment.createLead(dto, this.getActor(req));
  }

  @Post(":leadId/stage")
  updateStage(
    @Request() req,
    @Param("leadId") leadId: string,
    @Body() dto: UpdateVetRecruitmentStageDto,
  ) {
    return this.recruitment.updateStage(leadId, dto, this.getActor(req));
  }

  @Post(":leadId/follow-up")
  scheduleFollowUp(
    @Request() req,
    @Param("leadId") leadId: string,
    @Body() dto: ScheduleVetRecruitmentFollowUpDto,
  ) {
    return this.recruitment.scheduleFollowUp(leadId, dto, this.getActor(req));
  }

  private getActor(req): RecruitmentActor {
    return {
      id: req.user.id,
      role: req.user.role,
      ip: req.ip ?? req.headers?.["x-forwarded-for"],
      userAgent: req.headers?.["user-agent"],
    };
  }
}
