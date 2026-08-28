import { Module } from "@nestjs/common";
import { AppointmentsController } from "./appointments.controller";
import { LiveLocationController } from "./live-location.controller";
import { AppointmentsService } from "./appointments.service";
import { LiveLocationService } from "./live-location.service";
import { AuthModule } from "../auth/auth.module";
import { VetsModule } from "../vets/vets.module";

@Module({
  imports: [AuthModule, VetsModule],
  controllers: [AppointmentsController, LiveLocationController],
  providers: [AppointmentsService, LiveLocationService],
  exports: [AppointmentsService, LiveLocationService],
})
export class AppointmentsModule {}
