import { Module } from "@nestjs/common";
import { PetsController } from "./pets.controller";
import { PetsService } from "./pets.service";
import { ClinicalRecordService } from "./clinical-record.service";
import { AuthModule } from "../auth/auth.module";

/**
 * PetsModule — gestión de mascotas del sistema Nvet Care.
 *
 * PetsService se exporta para que AppointmentsModule pueda
 * verificar ownership de mascota al crear citas sin queries duplicadas.
 */
@Module({
  imports: [AuthModule],
  controllers: [PetsController],
  providers: [PetsService, ClinicalRecordService],
  exports: [PetsService],
})
export class PetsModule {}
