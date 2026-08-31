import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PetsModule } from "../pets/pets.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AuthModule, PetsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
