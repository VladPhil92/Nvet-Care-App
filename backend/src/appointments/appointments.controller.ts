import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdempotencyService } from '../common/security/idempotency.service';
import { UserRole } from '@prisma/client';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AddClinicalNotesDto } from './dto/add-clinical-notes.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Get()
  async getAppointments(
    @Request() req,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user.id;
    const userRole = req.user.role;

    return this.appointmentsService.getAppointments(userId, userRole, {
      status,
      startDate,
      endDate,
    });
  }

  @Get('today')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async getTodayAppointments(@Request() req) {
    return this.appointmentsService.getTodayAppointments(req.user.vetProfileId);
  }

  @Get(':id')
  async getAppointmentById(@Param('id') id: string, @Request() req) {
    const appointment = await this.appointmentsService.getAppointmentById(id);
    const userId = req.user.id;
    const isOwner =
      appointment.clientId === userId || appointment.vet.userId === userId;

    if (!isOwner && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You do not have access to this appointment');
    }

    return appointment;
  }

  /**
   * Booking replay-safe. Mobile ya envía `Idempotency-Key`; si un cliente
   * reintenta por timeout/red inestable devolvemos el mismo resultado en vez
   * de ejecutar nuevamente el booking. Para clientes legacy sin header se
   * conserva compatibilidad y la unique constraint sigue protegiendo el slot.
   */
  @Post()
  @UseGuards(EmailVerifiedGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async createAppointment(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @Request() req,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const create = async () =>
      this.appointmentsService.createAppointment(
        req.user.id,
        createAppointmentDto,
      );

    if (!idempotencyKey) {
      return create();
    }

    const replay = await this.idempotencyService.execute({
      key: `appointments:create:${req.user.id}:${idempotencyKey}`,
      endpoint: 'POST /appointments',
      userId: req.user.id,
      requestBody: createAppointmentDto,
      operation: async () => {
        const appointment = await create();
        return {
          status: HttpStatus.CREATED,
          body: JSON.parse(JSON.stringify(appointment)),
        };
      },
    });

    return replay.result;
  }

  @Patch(':id')
  async updateAppointment(
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @Request() req,
  ) {
    const appointment = await this.appointmentsService.getAppointmentById(id);
    if (appointment.clientId !== req.user.id && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own appointments');
    }

    return this.appointmentsService.updateAppointment(id, updateAppointmentDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelAppointment(
    @Param('id') id: string,
    @Request() req,
    @Body('reason') reason?: string,
  ) {
    const appointment = await this.appointmentsService.getAppointmentById(id);
    const userId = req.user.id;
    const isOwner =
      appointment.clientId === userId || appointment.vet.userId === userId;

    if (!isOwner && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only cancel your own appointments');
    }

    await this.appointmentsService.cancelAppointment(id, reason);
    return;
  }

  @Get(':id/tracking')
  async getAppointmentTracking(@Param('id') id: string, @Request() req) {
    const appointment = await this.appointmentsService.getAppointmentById(id);
    const userId = req.user.id;
    const isOwner =
      appointment.clientId === userId || appointment.vet.userId === userId;

    if (!isOwner && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You do not have access to this tracking');
    }

    return this.appointmentsService.getAppointmentTracking(id);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async updateAppointmentStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @Request() req,
  ) {
    const appointment = await this.appointmentsService.getAppointmentById(id);
    if (appointment.vet.userId !== req.user.id) {
      throw new ForbiddenException('You can only update your own appointments');
    }

    return this.appointmentsService.updateAppointmentStatus(
      id,
      updateStatusDto.status,
    );
  }

  @Post(':id/clinical-notes')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async addClinicalNotes(
    @Param('id') id: string,
    @Body() addClinicalNotesDto: AddClinicalNotesDto,
    @Request() req,
  ) {
    const appointment = await this.appointmentsService.getAppointmentById(id);
    if (appointment.vet.userId !== req.user.id) {
      throw new ForbiddenException(
        'You can only add notes to your own appointments',
      );
    }

    return this.appointmentsService.addClinicalNotes(
      id,
      addClinicalNotesDto.diagnosis,
      addClinicalNotesDto.treatment,
    );
  }
}
