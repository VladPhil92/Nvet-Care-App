import { Module, BadRequestException } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";

import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PseWebhookController } from "./pse-webhook.controller";
import { PseWebhookGuard } from "./guards/pse-webhook.guard";
import { PseSettlementService } from "./pse-settlement.service";
import { FinancialOperationsService } from "./financial-operations.service";
import { FinancialDataCryptoService } from "./financial-data-crypto.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [
    AuthModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
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
  controllers: [PaymentsController, PseWebhookController],
  providers: [
    PaymentsService,
    PseWebhookGuard,
    PseSettlementService,
    FinancialOperationsService,
    FinancialDataCryptoService,
  ],
  exports: [
    PaymentsService,
    PseWebhookGuard,
    PseSettlementService,
    FinancialOperationsService,
  ],
})
export class PaymentsModule {}
