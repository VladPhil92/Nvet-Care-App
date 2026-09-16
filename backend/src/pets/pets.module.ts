import { BadRequestException, Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
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
  imports: [
    AuthModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
      },
      fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/jpg", "image/png"];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Tipo de archivo no permitido: ${file.mimetype}. Solo JPG o PNG.`,
            ),
            false,
          );
        }
      },
    }),
  ],
  controllers: [PetsController],
  providers: [PetsService, ClinicalRecordService],
  exports: [PetsService],
})
export class PetsModule {}
