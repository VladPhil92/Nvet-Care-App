import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BadRequestException } from '@nestjs/common';

import { VetsController } from './vets.controller';
import { VetsService } from './vets.service';
import { VerificationService } from './verification.service';
import { PricesService } from './prices.service';
import { AuthModule } from '../auth/auth.module';

/**
 * VetsModule — agrupa controller, services y configuración de uploads.
 *
 * Decisiones técnicas:
 *  - `memoryStorage`: el archivo llega como Buffer al service, que decide
 *    dónde persistirlo (disco local en dev, S3 en prod). Esto desacopla
 *    el transporte de la persistencia.
 *  - `limits.fileSize`: 10 MB hard cap a nivel de Multer (defensa en profundidad
 *    además de la validación en VerificationService).
 *  - `fileFilter`: rechaza tipos MIME no permitidos antes de llegar al handler.
 *  - Importa `AuthModule` para reutilizar guards/strategies (no se redefine JWT).
 */
@Module({
  imports: [
    AuthModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
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
  controllers: [VetsController],
  providers: [VetsService, VerificationService, PricesService],
  exports: [VetsService, VerificationService, PricesService],
})
export class VetsModule {}
