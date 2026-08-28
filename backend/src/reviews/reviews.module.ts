import { Module } from "@nestjs/common";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";
import { AuthModule } from "../auth/auth.module";

/**
 * ReviewsModule — calificaciones y ratings del sistema Nvet Care.
 *
 * Expone ReviewsService para que otros módulos (ej. AppointmentsModule)
 * puedan verificar si una cita ya fue calificada sin hacer queries directas.
 */
@Module({
  imports: [AuthModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
