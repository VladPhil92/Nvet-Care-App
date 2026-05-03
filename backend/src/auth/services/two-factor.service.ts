import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';

/**
 * TwoFactorService — autenticación de 2 factores con TOTP (RFC 6238).
 *
 * Compatible con Google Authenticator, Authy, Microsoft Authenticator,
 * 1Password, Bitwarden y cualquier otra app TOTP estándar.
 *
 * Decisiones de seguridad:
 *  - Secret de 20 bytes random (160 bits) codificado en Base32 (RFC 4648)
 *  - Period: 30s (estándar TOTP)
 *  - Algoritmo: HMAC-SHA1 (compatibilidad universal)
 *  - Digits: 6
 *  - Window: ±1 (acepta el código actual y los inmediatamente anteriores
 *    o siguientes para tolerancia a clock skew)
 *  - Secret se cifra AES-256-GCM antes de persistir
 *  - 10 recovery codes one-time generados al enrolar (Argon2id-hashed)
 *
 * No depende de `otplib` ni `speakeasy` — implementación nativa con
 * `crypto` para reducir attack surface y bundle size.
 */
@Injectable()
export class TwoFactorService {
  private readonly TOTP_PERIOD = 30; // seconds
  private readonly TOTP_DIGITS = 6;
  private readonly TOTP_WINDOW = 1; // ±1 step
  private readonly RECOVERY_CODE_COUNT = 10;
  private readonly ENCRYPTION_KEY: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {
    // La master key viene de env, fallback a una derivación del JWT_SECRET.
    // En producción DEBE ser una key dedicada de 32 bytes (256 bits).
    const keySource = process.env.TWO_FACTOR_ENCRYPTION_KEY ?? process.env.JWT_SECRET ?? '';
    if (!keySource) {
      throw new Error(
        'TWO_FACTOR_ENCRYPTION_KEY o JWT_SECRET deben estar configurados en producción',
      );
    }
    this.ENCRYPTION_KEY = crypto.createHash('sha256').update(keySource).digest();
  }

  // ============================================================
  // ENROLLMENT
  // ============================================================

  /**
   * Genera un nuevo secret + URI otpauth para el usuario.
   * El secret NO se persiste hasta que el usuario verifique con un código TOTP válido.
   *
   * Retorna:
   *   - secret: para escanear manualmente (en caso de no poder leer QR)
   *   - otpauthUrl: URI estándar otpauth:// que el cliente convierte en QR
   *   - encryptedSecret: para persistir tras `confirmEnrollment` exitoso
   */
  async startEnrollment(userId: string, userEmail: string): Promise<{
    secret: string;
    otpauthUrl: string;
    encryptedSecret: string;
  }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    if (user.twoFactorEnabled) {
      throw new ConflictException('2FA ya está habilitado para esta cuenta');
    }

    // Secret random de 20 bytes (160 bits) — recomendación RFC 6238
    const secretBytes = crypto.randomBytes(20);
    const secret = this.base32Encode(secretBytes);

    const issuer = encodeURIComponent('Nvet Care');
    const accountName = encodeURIComponent(userEmail);
    const otpauthUrl = `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${this.TOTP_DIGITS}&period=${this.TOTP_PERIOD}`;

    const encryptedSecret = this.encrypt(secret);

    return { secret, otpauthUrl, encryptedSecret };
  }

  /**
   * Confirma el enrolamiento: el usuario escaneó el QR y nos manda 1 código TOTP.
   * Si el código es válido, persistimos el secret + generamos los recovery codes.
   */
  async confirmEnrollment(
    userId: string,
    encryptedSecret: string,
    code: string,
  ): Promise<{ recoveryCodes: string[] }> {
    const decryptedSecret = this.decrypt(encryptedSecret);
    if (!this.verifyTotpCode(decryptedSecret, code)) {
      throw new UnauthorizedException(
        'Código TOTP inválido. Verifica que la hora de tu dispositivo esté sincronizada.',
      );
    }

    // Generar 10 códigos de recuperación (formato: XXXX-XXXX-XX, 10 chars sin guiones)
    const rawRecoveryCodes = Array.from({ length: this.RECOVERY_CODE_COUNT }, () =>
      this.generateRecoveryCode(),
    );

    // Hash con Argon2id (mismo algoritmo que passwords)
    const recoveryCodesHash = await Promise.all(
      rawRecoveryCodes.map((code) => this.passwordService.hash(code)),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: true,
        twoFactorEnrolledAt: new Date(),
        recoveryCodesHash,
      },
    });

    return { recoveryCodes: rawRecoveryCodes };
  }

  // ============================================================
  // VERIFICATION (durante login)
  // ============================================================

  /**
   * Verifica un código TOTP durante el flujo de login.
   * Lanza UnauthorizedException si es inválido.
   */
  async verifyDuringLogin(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA no está habilitado');
    }

    const secret = this.decrypt(user.twoFactorSecret);
    if (!this.verifyTotpCode(secret, code)) {
      throw new UnauthorizedException('Código TOTP inválido o expirado');
    }
  }

  /**
   * Verifica un código de recuperación (alternativa cuando se pierde el TOTP).
   * Tras éxito, INVALIDA ese código (single-use) y retorna cuántos quedan.
   */
  async verifyRecoveryCode(userId: string, recoveryCode: string): Promise<{
    remainingCodes: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { recoveryCodesHash: true },
    });
    if (!user || user.recoveryCodesHash.length === 0) {
      throw new UnauthorizedException('No hay códigos de recuperación disponibles');
    }

    // Buscar el primer hash que matchee el código (timing-safe)
    let matchedIndex = -1;
    for (let i = 0; i < user.recoveryCodesHash.length; i++) {
      const valid = await this.passwordService.verify(
        recoveryCode,
        user.recoveryCodesHash[i],
      );
      if (valid.isValid) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      throw new UnauthorizedException('Código de recuperación inválido');
    }

    // Remover el hash usado (single-use)
    const remainingHashes = user.recoveryCodesHash.filter((_, i) => i !== matchedIndex);
    await this.prisma.user.update({
      where: { id: userId },
      data: { recoveryCodesHash: remainingHashes },
    });

    return { remainingCodes: remainingHashes.length };
  }

  // ============================================================
  // DISABLE
  // ============================================================

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        passwordHash: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
      },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('2FA no está habilitado');
    }

    // 1. Verificar password
    const passwordCheck = await this.passwordService.verify(password, user.passwordHash);
    if (!passwordCheck.isValid) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    // 2. Verificar código TOTP actual
    const secret = this.decrypt(user.twoFactorSecret);
    if (!this.verifyTotpCode(secret, code)) {
      throw new UnauthorizedException('Código TOTP inválido');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorEnrolledAt: null,
        recoveryCodesHash: [],
      },
    });
  }

  // ============================================================
  // INTERNAL: TOTP algorithm (RFC 6238)
  // ============================================================

  /**
   * Verifica un código TOTP con tolerancia de ±N steps (window).
   * Esto acomoda clock skew típico de teléfonos (~30s).
   */
  private verifyTotpCode(secret: string, code: string): boolean {
    const cleanCode = code.replace(/\s/g, '');
    if (!/^\d{6,8}$/.test(cleanCode)) return false;

    const now = Math.floor(Date.now() / 1000 / this.TOTP_PERIOD);
    for (let i = -this.TOTP_WINDOW; i <= this.TOTP_WINDOW; i++) {
      const expected = this.generateTotpCode(secret, now + i);
      // Comparación timing-safe
      if (this.timingSafeEqual(expected, cleanCode)) return true;
    }
    return false;
  }

  /**
   * Genera el código TOTP para un timestep específico.
   * Implementa RFC 6238 sección 4 (HOTP con T = floor(unix/period)).
   */
  private generateTotpCode(secret: string, counter: number): string {
    const secretBytes = this.base32Decode(secret);
    const counterBytes = Buffer.alloc(8);
    // Big-endian 64-bit counter
    counterBytes.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBytes.writeUInt32BE(counter & 0xffffffff, 4);

    const hmac = crypto.createHmac('sha1', secretBytes).update(counterBytes).digest();
    // Dynamic truncation (RFC 4226 sec 5.3)
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = code % Math.pow(10, this.TOTP_DIGITS);
    return otp.toString().padStart(this.TOTP_DIGITS, '0');
  }

  // ============================================================
  // INTERNAL: Encryption (AES-256-GCM)
  // ============================================================

  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: base64(iv || authTag || ciphertext)
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decrypt(payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // ============================================================
  // INTERNAL: Helpers
  // ============================================================

  private generateRecoveryCode(): string {
    // 10 caracteres alfanuméricos sin chars ambiguos (0/O, 1/I/l)
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(10);
    for (let i = 0; i < 10; i++) {
      code += alphabet[bytes[i] % alphabet.length];
    }
    return code;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private base32Encode(buffer: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    let output = '';
    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
    return output;
  }

  private base32Decode(encoded: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const cleanInput = encoded.replace(/=+$/, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (let i = 0; i < cleanInput.length; i++) {
      const idx = alphabet.indexOf(cleanInput[i]);
      if (idx < 0) throw new Error('Carácter inválido en Base32');
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }
}
