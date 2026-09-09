import { Module } from "@nestjs/common";
import { AppointmentsController } from "./appointments.controller";
import { LiveLocationController } from "./live-location.controller";
import { AppointmentsService } from "./appointments.service";
import { TodayAppointmentsService } from "./today-appointments.service";
import { LiveLocationService } from "./live-location.service";
import { AuthModule } from "../auth/auth.module";
import { BetaModule } from "../beta/beta.module";
import { CoverageModule } from "../coverage/coverage.module";
import { VetsModule } from "../vets/vets.module";

@Module({
  imports: [AuthModule, BetaModule, CoverageModule, VetsModule],
  controllers: [AppointmentsController, LiveLocationController],
  providers: [
    AppointmentsService,
    TodayAppointmentsService,
    LiveLocationService,
  ],
  exports: [AppointmentsService, LiveLocationService],
})
export class AppointmentsModule {}
