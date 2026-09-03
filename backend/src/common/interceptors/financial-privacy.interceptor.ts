import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

const ALWAYS_PRIVATE_FIELDS = new Set([
  "transferProofStorageKey",
  "destinationCiphertext",
  "destinationFingerprint",
]);

/**
 * Defense-in-depth redaction for financial API responses.
 *
 * Prisma returns every scalar field unless a query explicitly selects a safe
 * projection. As payment models evolve, a new private storage key or encrypted
 * payout value must not become externally visible just because a service used
 * `findUnique()` without a select. This interceptor makes those internal fields
 * non-exportable at the HTTP boundary.
 *
 * Legacy TRANSFER rows may contain a historical proof URL in `hashOnchain`.
 * `hashOnchain` is preserved for non-TRANSFER transactions because it remains a
 * legitimate CTG-chain field, but it is redacted for TRANSFER responses.
 */
@Injectable()
export class FinancialPrivacyInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((value) => this.redact(value)));
  }

  private redact(value: unknown): unknown {
    if (
      value === null ||
      value === undefined ||
      typeof value !== "object" ||
      value instanceof Date ||
      Buffer.isBuffer(value) ||
      value instanceof StreamableFile
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }

    const source = value as Record<string, unknown>;
    const isTransfer = source.paymentMethod === "TRANSFER";
    const safe: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(source)) {
      if (ALWAYS_PRIVATE_FIELDS.has(key)) continue;
      if (isTransfer && key === "hashOnchain") continue;
      safe[key] = this.redact(nested);
    }

    return safe;
  }
}
