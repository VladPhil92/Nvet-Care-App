import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';

import { VetsController } from './vets.controller';
import { ScheduleController } from './schedule.controller';
import { VetsService } from './vets.service';
import { VerificationService } from './verification.service';
import { PricesService } from './prices.service';
import { ScheduleService } from './schedule.service';
import { AuthModule } from '../auth/auth.module';

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
        const allowed = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'application/pdf',
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
  controllers: [VetsController, ScheduleController],
  providers: [
    VetsService,
    VerificationService,
    PricesService,
    ScheduleService,
  ],
  exports: [
    VetsService,
    VerificationService,
    PricesService,
    ScheduleService,
  ],
})
export class VetsModule {}
