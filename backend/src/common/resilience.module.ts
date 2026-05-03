import { Global, Module } from '@nestjs/common'
import { PasswordService } from '../auth/services/password.service'
import { TokenBlacklistService } from '../auth/services/token-blacklist.service'
import { AuditService } from './audit/audit.service'
import { MagicBytesValidator } from './security/magic-bytes.service'
import { IdempotencyService } from './security/idempotency.service'
import { SagaOrchestratorService } from './saga/saga-orchestrator.service'

/**
 * ResilienceModule — agrupa servicios de seguridad y resiliencia que
 * deben estar disponibles globalmente:
 *
 *  - PasswordService (Argon2id)
 *  - TokenBlacklistService (revocación JWT)
 *  - AuditService (immutable audit log)
 *  - MagicBytesValidator (verificar archivos por contenido real)
 *  - IdempotencyService (replay-safe POSTs críticos)
 *  - SagaOrchestratorService (transacciones distribuidas con compensación)
 *
 * `@Global` para evitar tener que importar este módulo en cada feature.
 */
@Global()
@Module({
  providers: [
    PasswordService,
    TokenBlacklistService,
    AuditService,
    MagicBytesValidator,
    IdempotencyService,
    SagaOrchestratorService,
  ],
  exports: [
    PasswordService,
    TokenBlacklistService,
    AuditService,
    MagicBytesValidator,
    IdempotencyService,
    SagaOrchestratorService,
  ],
})
export class ResilienceModule {}
