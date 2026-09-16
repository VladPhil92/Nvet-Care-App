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
      // Bounded part/field counts: multer is pinned below 2.2.1 by the NestJS 10
      // line, where several open DoS advisories are reachable only through
      // unbounded multipart field parsing. This endpoint takes no body fields.
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
        fields: 2,
        parts: 4,
        fieldNameSize: 100,
        headerPairs: 32,
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
