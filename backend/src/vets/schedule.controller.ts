import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { GetVetScheduleQueryDto } from "./dto/schedule.dto";
import { ScheduleService } from "./schedule.service";

/**
 * Endpoint público consumido por BookingDateSelector en Mobile.
 */
@Controller("vets")
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get(":id/schedule")
  async getVetSchedule(
    @Param("id", ParseUUIDPipe) vetId: string,
    @Query() query: GetVetScheduleQueryDto,
  ) {
    return this.scheduleService.getAvailability(vetId, query.date);
  }
}
