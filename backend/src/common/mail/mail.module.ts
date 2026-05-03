import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * MailModule — provee `MailService` globalmente.
 *
 * Marcado `@Global()` para evitar que cada feature module tenga que importarlo.
 * Si el día de mañana se necesita aislar (ej: dual-tenant con drivers distintos
 * por tenant), basta con quitar `@Global()` y exportarlo desde los módulos
 * que lo consumen.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
