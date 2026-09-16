import { BadRequestException, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { VetsController } from "./vets.controller";
import { ScheduleController } from "./schedule.controller";
import { ProfessionalRegistryController } from "./professional-registry.controller";
import { VetsService } from "./vets.service";
import { VerificationService } from "./verification.service";
import { ProfessionalRegistryService } from "./professional-registry.service";
import { PricesService } from "./prices.service";
import { MembershipsService } from "./memberships.service";
import { ScheduleService } from "./schedule.service";
import { PublicVetLocationInterceptor } from "./public-location.interceptor";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    AuthModule,
    MulterModule.register({
      storage: memoryStorage(),
      // Bounded part/field counts: multer is pinned below 2.2.1 by the NestJS 10
      // line, where several open DoS advisories are reachable only through
      // unbounded multipart field parsing. UploadDocumentDto carries 5 fields.
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 1,
        fields: 10,
        parts: 12,
        fieldNameSize: 100,
        headerPairs: 32,
      },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "application/pdf",
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `Tipo de archivo no permitido: ${file.mimetype}. Solo JPG, PNG o PDF.`,
            ),
            false,
          );
        }
      },
    }),
  ],
  controllers: [
    VetsController,
    ScheduleController,
    ProfessionalRegistryController,
  ],
  providers: [
    VetsService,
    VerificationService,
    ProfessionalRegistryService,
    PricesService,
    MembershipsService,
    ScheduleService,
    {
      provide: APP_INTERCEPTOR,
      useClass: PublicVetLocationInterceptor,
    },
  ],
  exports: [
    VetsService,
    VerificationService,
    ProfessionalRegistryService,
    PricesService,
    MembershipsService,
    ScheduleService,
  ],
})
export class VetsModule {}
