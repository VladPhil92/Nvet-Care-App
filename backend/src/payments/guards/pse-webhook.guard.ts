import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * PseWebhookGuard — valida HMAC-SHA256 de webhooks entrantes del proveedor PSE.
 *
 * Por qué es crítico:
 *  - El endpoint del webhook es público (no requiere JWT) porque el proveedor
 *    PSE no tiene credenciales del usuario.
 *  - SIN validación HMAC, cualquiera podría enviar requests fingiendo ser PSE
 *    y disparar confirmaciones de pago falsas.
 *  - Con HMAC, solo quien posee `PSE_WEBHOOK_SECRET` (compartido entre PSE
 *    y nosotros) puede generar una firma válida.
 *
 * Algoritmo:
 *  1. Cliente envía: `X-PSE-Signature: <hex_hmac_sha256_del_raw_body>`
 *  2. Servidor: `expected = HMAC_SHA256(PSE_WEBHOOK_SECRET, rawBody)`
 *  3. Comparación timing-safe (`crypto.timingSafeEqual`) para evitar leaks por timing
 *  4. Adicionalmente validamos timestamp `X-PSE-Timestamp` (replay attack prevention)
 *     con tolerancia de 5 minutos.
 *
 * Requisitos del bootstrap:
 *  - `NestFactory.create(AppModule, { rawBody: true })` debe estar activo en main.ts
 *    para que `req.rawBody` esté disponible.
 *  - Si `req.rawBody` no está disponible, el guard cae a `JSON.stringify(req.body)`
 *    como fallback (no es bit-exact pero suficiente para sandbox/dev).
 */
@Injectable()
export class PseWebhookGuard implements CanActivate {
  private readonly logger = new Logger(PseWebhookGuard.name);
  private readonly TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 min

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const secret = process.env.PSE_WEBHOOK_SECRET;

    if (!secret) {
      // En prod, sin secret configurado el endpoint debe rechazar todo.
      // No queremos un default seguro que aceptar cualquier cosa.
      this.logger.error(
        'PSE_WEBHOOK_SECRET no configurado. Rechazando webhook PSE.',
      );
      throw new ServiceUnavailableException(
        'Webhook handler no configurado. Contacta al administrador.',
      );
    }

    const signature = req.headers['x-pse-signature'] as string | undefined;
    const timestamp = req.headers['x-pse-timestamp'] as string | undefined;

    if (!signature) {
      this.logger.warn(
        `Webhook PSE rechazado: falta header X-PSE-Signature (ip=${this.extractIp(req)})`,
      );
      throw new UnauthorizedException('Firma del webhook ausente');
    }

    // Validación de timestamp (anti-replay) — opcional pero recomendado por PSE.
    // Si el provider no envía timestamp, lo dejamos pasar (firma sigue siendo válida).
    if (timestamp) {
      const tsNumber = Number.parseInt(timestamp, 10);
      if (!Number.isFinite(tsNumber)) {
        throw new UnauthorizedException('Timestamp del webhook inválido');
      }
      const driftSeconds = Math.abs(Date.now() / 1000 - tsNumber);
      if (driftSeconds > this.TIMESTAMP_TOLERANCE_SECONDS) {
        this.logger.warn(
          `Webhook PSE rechazado por replay: drift=${Math.round(driftSeconds)}s ` +
            `(tolerancia=${this.TIMESTAMP_TOLERANCE_SECONDS}s)`,
        );
        throw new UnauthorizedException(
          'Timestamp del webhook fuera de tolerancia (posible replay attack)',
        );
      }
    }

    // Calcular HMAC esperado
    const rawBody = this.getRawBody(req);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    // Comparación timing-safe
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    const valid =
      sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!valid) {
      this.logger.warn(
        `Webhook PSE rechazado: firma inválida (ip=${this.extractIp(req)}, ` +
          `expectedPrefix=${expected.slice(0, 12)}, gotPrefix=${signature.slice(0, 12)})`,
      );
      throw new UnauthorizedException('Firma del webhook inválida');
    }

    return true;
  }

  /**
   * Obtiene el raw body usado para calcular el HMAC.
   * Preferimos `req.rawBody` (preservado por `NestFactory.create({ rawBody: true })`).
   * Fallback: re-serializar el body parseado (solo para dev/sandbox).
   */
  private getRawBody(req: any): string | Buffer {
    if (req.rawBody) return req.rawBody;
    if (Buffer.isBuffer(req.body)) return req.body;

    // Fallback: re-serializar. WARNING: si el provider firmó con whitespace
    // distinto al que produce JSON.stringify, esto fallará. En prod USAR rawBody.
    return JSON.stringify(req.body ?? {});
  }

  private extractIp(req: any): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown'
    );
  }
}
