import { Module, BadRequestException } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PseWebhookController } from './pse-webhook.controller';
import { PseWebhookGuard } from './guards/pse-webhook.guard';
import { AuthModule } from '../auth/auth.module';

/**
 * PaymentsModule — procesamiento de pagos, transferencias, PSE y retiros.
 *
 * Dependencias:
 *  - AuthModule (guards JWT y RBAC)
 *  - MulterModule local (separado del de VetsModule para limit dedicado de comprobantes)
 *
 * Decisiones técnicas:
 *  - `memoryStorage`: el service decide la persistencia (disco / S3)
 *  - `limits.fileSize`: 5 MB para comprobantes (más estricto que documentos de verificación)
 *  - `fileFilter`: solo JPG/PNG/PDF
 *
 * Exporta el service para que otros módulos (Admin, Notifications) puedan
 * orquestar transacciones sin duplicar lógica.
 */
@Module({
  imports: [
    AuthModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
        files: 1,
      },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
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
  controllers: [PaymentsController, PseWebhookController],
  providers: [PaymentsService, PseWebhookGuard],
  exports: [PaymentsService, PseWebhookGuard],
})
export class PaymentsModule {}
