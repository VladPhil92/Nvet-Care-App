import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { UserRole } from '@prisma/client';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AddClinicalNotesDto } from './dto/add-clinical-notes.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * GET /appointments
   * Get appointments with optional filters
   */
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

  /**
   * GET /appointments/today
   * Get today's appointments (for vets)
   */
  @Get('today')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async getTodayAppointments(@Request() req) {
    return this.appointmentsService.getTodayAppointments(req.user.vetProfileId);
  }

  /**
   * GET /appointments/:id
   * Get appointment by ID
   */
  @Get(':id')
  async getAppointmentById(@Param('id') id: string, @Request() req) {
    const appointment = await this.appointmentsService.getAppointmentById(id);

    // Check ownership
    const userId = req.user.id;
    const isOwner =
      appointment.clientId === userId || appointment.vet.userId === userId;

    if (!isOwner && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You do not have access to this appointment');
    }

    return appointment;
  }

  /**
   * POST /appointments
   * Create a new appointment (clients only).
   *
   * Guards aplicados:
   *  - JwtAuthGuard (a nivel de clase): debe estar autenticado
   *  - EmailVerifiedGuard: bloquea hasta que el cliente verifique su email
   *    (mitigación de fraude con cuentas recién creadas)
   *  - RolesGuard + @Roles(CLIENT): solo clientes pueden crear citas
   */
  @Post()
  @UseGuards(EmailVerifiedGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @HttpCode(HttpStatus.CREATED)
  async createAppointment(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @Request() req,
  ) {
    return this.appointmentsService.createAppointment(
      req.user.id,
      createAppointmentDto,
    );
  }

  /**
   * PATCH /appointments/:id
   * Update appointment details
   */
  @Patch(':id')
  async updateAppointment(
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @Request() req,
  ) {
    // Verify ownership
    const appointment = await this.appointmentsService.getAppointmentById(id);
    if (appointment.clientId !== req.user.id && req.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own appointments');
    }

    return this.appointmentsService.updateAppointment(id, updateAppointmentDto);
  }

  /**
   * DELETE /appointments/:id
   * Cancel appointment
   */
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

  /**
   * GET /appointments/:id/tracking
   * Get appointment tracking (location, ETA, status history)
   */
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

  /**
   * PATCH /appointments/:id/status
   * Update appointment status (vets only)
   */
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

  /**
   * PATCH /appointments/:id/location
   * Update vet GPS location during an in-progress appointment
   */
  @Patch(':id/location')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VET)
  async updateVetLocation(
    @Param('id') id: string,
    @Body() body: { latitude: number; longitude: number; etaMinutes?: number },
    @Request() req,
  ) {
    return this.appointmentsService.updateVetLocation(
      id,
      req.user.id,
      body.latitude,
      body.longitude,
      body.etaMinutes,
    );
  }

  /**
   * POST /appointments/:id/clinical-notes
   * Add clinical notes (diagnosis, treatment) - vets only
   */
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
