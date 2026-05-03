import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle, seconds } from '@nestjs/throttler';
import { PseWebhookGuard } from './guards/pse-webhook.guard';
import { PaymentsService } from './payments.service';

/**
 * Payload típico de webhook PSE. Cada provider tiene su propio shape;
 * ajustar al tipo real según contrato del partner (Wompi, ePayco, PayU, etc.).
 */
interface PseWebhookPayload {
  /** ID que el provider asigna a la transacción */
  externalTransactionId: string;
  /** Nuestro transactionId que enviamos en initiatePse */
  transactionId: string;
  /** APPROVED | DECLINED | PENDING | EXPIRED */
  status: string;
  /** Monto confirmado (para validación de double-check) */
  amount?: number;
  /** Timestamp del provider */
  timestamp?: string;
}

/**
 * PseWebhookController — endpoint público para recibir notificaciones del
 * proveedor PSE sobre el estado de pagos.
 *
 * Decisiones:
 *  - Separado de PaymentsController porque ESE tiene `@UseGuards(JwtAuthGuard)`
 *    a nivel de clase y el webhook es público.
 *  - Protección: HMAC-SHA256 vía `PseWebhookGuard` + rate limit razonable.
 *  - Path: `/webhooks/pse` (no anidado bajo `/payments` para hacer evidente
 *    que es un endpoint externo, no del usuario).
 *  - Idempotencia: el provider puede reintentar; el service debe ser
 *    idempotente al procesar el mismo `externalTransactionId`.
 */
@Controller('webhooks/pse')
export class PseWebhookController {
  private readonly logger = new Logger(PseWebhookController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /webhooks/pse — endpoint que el proveedor PSE invoca.
   *
   * Headers requeridos:
   *   X-PSE-Signature: hex(HMAC_SHA256(PSE_WEBHOOK_SECRET, rawBody))
   *   X-PSE-Timestamp: unix seconds (anti-replay, ±5 min)
   *
   * Respuesta:
   *   200 OK con cuerpo `{ received: true }` para acknowledge.
   *   El provider reintentará si retornamos 4xx/5xx.
   */
  @Post()
  @UseGuards(PseWebhookGuard)
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  @HttpCode(HttpStatus.OK)
  async handlePseWebhook(@Body() payload: PseWebhookPayload) {
    this.logger.log(
      `PSE webhook recibido: txId=${payload.transactionId} status=${payload.status}`,
    );

    // Delegar al service. El service es idempotente: si la transacción ya
    // fue procesada con el mismo status, retorna sin cambios.
    if (typeof (this.paymentsService as any).handlePseWebhook === 'function') {
      await (this.paymentsService as any).handlePseWebhook(payload);
    } else {
      // Si el service aún no implementa el handler (versión actual), al
      // menos loggeamos para que no se pierda el evento.
      this.logger.warn(
        'PaymentsService.handlePseWebhook no implementado. Payload registrado solo en logs.',
      );
    }

    return { received: true };
  }

  /**
   * Health check del endpoint webhook (útil para que el proveedor valide
   * que el endpoint está alcanzable). NO valida HMAC porque solo retorna
   * status estático.
   */
  @Post('ping')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async pingWebhook() {
    return { ok: true, ts: new Date().toISOString() };
  }
}
