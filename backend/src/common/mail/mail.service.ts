import { Injectable, Logger } from "@nestjs/common";
import {
  passwordResetTemplate,
  emailVerificationTemplate,
  vetApprovalTemplate,
} from "./mail.templates";

/**
 * MailService — capa de envío de email production-grade con driver pluggable.
 *
 * Drivers soportados (configurables vía `MAIL_DRIVER` env var):
 *
 *   1. `console` (default en dev): solo loggea el contenido. Útil para CI y dev local.
 *   2. `sendgrid`: usa la HTTP API de SendGrid v3 con `fetch` nativo (Node 18+).
 *      Requiere: `SENDGRID_API_KEY`. NO requiere instalar la librería oficial.
 *   3. `ses`: stub con instrucciones para integrar `@aws-sdk/client-ses`.
 *   4. `smtp`: stub con instrucciones para integrar `nodemailer`.
 *
 * Decisiones:
 *   - Sin deps externas obligatorias: usa `fetch` (Node 18+) para SendGrid.
 *     Para SES/SMTP el código está listo pero la dep es opcional (lazy require).
 *   - Errores del envío NO rompen la operación principal: retornamos
 *     `{ ok, providerMessageId?, error? }`. El servicio que invoca decide si
 *     falla la operación o solo loggea.
 *   - El driver se resuelve una sola vez en el constructor (no por cada envío).
 *   - Templates HTML definidos en `mail.templates.ts` (brand-aligned).
 *
 * Uso:
 *   await mailService.sendPasswordReset({ to, firstName, resetLink, expiresInMinutes })
 *   await mailService.sendEmailVerification({ to, firstName, verifyLink, expiresInHours })
 */

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** Compatibility alias for legacy callers; new code should prefer `error`. */
  reason?: string;
  driver: string;
}

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Categoría para tracking del provider (SendGrid: `categories`, SES: tags).
   */
  category?: string;
}

type DriverFn = (
  params: SendMailParams,
  from: string,
  fromName: string,
) => Promise<SendResult>;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  // driverName y driver NO son readonly porque pueden cambiar en el constructor
  // si SENDGRID_API_KEY falta y caemos a console.
  private driverName: "console" | "sendgrid" | "ses" | "smtp";
  private driver: DriverFn;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor() {
    const configured = (process.env.MAIL_DRIVER ?? "").trim().toLowerCase();
    const valid = ["console", "sendgrid", "ses", "smtp"];
    this.driverName = (
      valid.includes(configured) ? configured : "console"
    ) as typeof this.driverName;

    this.fromAddress = process.env.MAIL_FROM ?? "no-reply@nvetcare.co";
    this.fromName = process.env.MAIL_FROM_NAME ?? "Nvet Care";

    switch (this.driverName) {
      case "sendgrid":
        this.driver = this.sendViaSendGrid.bind(this);
        if (!process.env.SENDGRID_API_KEY) {
          this.logger.error(
            "MAIL_DRIVER=sendgrid pero SENDGRID_API_KEY no está configurado. Cayendo a console.",
          );
          this.driverName = "console";
          this.driver = this.sendViaConsole.bind(this);
        }
        break;
      case "ses":
        this.driver = this.sendViaSes.bind(this);
        break;
      case "smtp":
        this.driver = this.sendViaSmtp.bind(this);
        break;
      default:
        this.driver = this.sendViaConsole.bind(this);
    }

    this.logger.log(
      `MailService initialized: driver=${this.driverName} from="${this.fromName} <${this.fromAddress}>"`,
    );
  }

  // ============================================================
  // PUBLIC API — alto nivel (templates)
  // ============================================================

  async sendPasswordReset(params: {
    to: string;
    firstName: string;
    resetLink: string;
    expiresInMinutes: number;
  }): Promise<SendResult> {
    const rendered = passwordResetTemplate(params);
    return this.send({
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category: "password_reset",
    });
  }

  async sendEmailVerification(params: {
    to: string;
    firstName: string;
    verifyLink: string;
    expiresInHours: number;
  }): Promise<SendResult> {
    const rendered = emailVerificationTemplate(params);
    return this.send({
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category: "email_verification",
    });
  }

  async sendVetApproval(params: {
    to: string;
    firstName: string;
    dashboardLink?: string;
  }): Promise<SendResult> {
    const rendered = vetApprovalTemplate(params);
    const result = await this.send({
      to: params.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      category: "vet_verification_approved",
    });
    return result.ok ? result : { ...result, reason: result.error };
  }

  // ============================================================
  // PUBLIC API — bajo nivel (driver agnostic)
  // ============================================================

  async send(params: SendMailParams): Promise<SendResult> {
    if (!isValidEmail(params.to)) {
      return {
        ok: false,
        error: `dirección destino inválida: ${params.to}`,
        driver: this.driverName,
      };
    }
    try {
      return await this.driver(params, this.fromAddress, this.fromName);
    } catch (e) {
      const msg = (e as Error).message ?? "unknown error";
      this.logger.error(
        `MailService.send falló (driver=${this.driverName}, to=${params.to}): ${msg}`,
      );
      return { ok: false, error: msg, driver: this.driverName };
    }
  }

  // ============================================================
  // DRIVERS
  // ============================================================

  /**
   * Driver `console` — solo loggea. Útil en dev/CI.
   * El contenido completo se imprime en orden DEBUG para que el desarrollador
   * pueda copiar el link de verificación o reset.
   */
  private async sendViaConsole(
    params: SendMailParams,
    _from: string,
    _fromName: string,
  ): Promise<SendResult> {
    this.logger.log(
      `[MAIL:console] to=${params.to} subject="${params.subject}" category=${params.category ?? "-"}`,
    );
    // Imprimimos el text plano (no el HTML) para mantener logs legibles
    this.logger.debug(`[MAIL:console] body:\n${params.text}`);
    return {
      ok: true,
      providerMessageId: `console-${Date.now()}`,
      driver: "console",
    };
  }

  /**
   * Driver `sendgrid` — HTTP API v3 con `fetch` nativo (Node 18+).
   * Doc: https://docs.sendgrid.com/api-reference/mail-send/mail-send
   */
  private async sendViaSendGrid(
    params: SendMailParams,
    from: string,
    fromName: string,
  ): Promise<SendResult> {
    const apiKey = process.env.SENDGRID_API_KEY!;
    const body = {
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: from, name: fromName },
      subject: params.subject,
      content: [
        { type: "text/plain", value: params.text },
        { type: "text/html", value: params.html },
      ],
      categories: params.category ? [params.category] : undefined,
      // SendGrid mejora deliverability con tracking_settings; los desactivamos
      // explícitamente para que el link no sea reescrito (importante para
      // tokens de reset/verify donde el link debe llegar literal).
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
    };

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`SendGrid ${res.status}: ${errBody.slice(0, 500)}`);
    }
    // SendGrid retorna 202 sin body; el message-id viene en headers
    const messageId = res.headers.get("x-message-id") ?? undefined;
    return { ok: true, providerMessageId: messageId, driver: "sendgrid" };
  }

  /**
   * Driver `ses` — STUB. Para activar:
   *   1. `npm install @aws-sdk/client-ses`
   *   2. Configurar `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   *   3. Reemplazar este stub por código real:
   *
   *      import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-ses';
   *      const client = new SESv2Client({ region: process.env.AWS_REGION });
   *      const cmd = new SendEmailCommand({
   *        FromEmailAddress: `${fromName} <${from}>`,
   *        Destination: { ToAddresses: [params.to] },
   *        Content: { Simple: { Subject: { Data: params.subject },
   *          Body: { Html: { Data: params.html }, Text: { Data: params.text } } } },
   *      });
   *      const out = await client.send(cmd);
   *      return { ok: true, providerMessageId: out.MessageId, driver: 'ses' };
   */
  private async sendViaSes(
    _params: SendMailParams,
    _from: string,
    _fromName: string,
  ): Promise<SendResult> {
    this.logger.warn(
      "MAIL_DRIVER=ses pero el driver es stub. Instala @aws-sdk/client-ses y reemplaza sendViaSes().",
    );
    return {
      ok: false,
      error: "SES driver no implementado (stub)",
      driver: "ses",
    };
  }

  /**
   * Driver `smtp` — STUB. Para activar:
   *   1. `npm install nodemailer`
   *   2. Configurar SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
   *   3. Reemplazar este stub por código real con nodemailer.createTransport
   */
  private async sendViaSmtp(
    _params: SendMailParams,
    _from: string,
    _fromName: string,
  ): Promise<SendResult> {
    this.logger.warn(
      "MAIL_DRIVER=smtp pero el driver es stub. Instala nodemailer y reemplaza sendViaSmtp().",
    );
    return {
      ok: false,
      error: "SMTP driver no implementado (stub)",
      driver: "smtp",
    };
  }
}

// ============================================================
// HELPERS
// ============================================================

function isValidEmail(email: string): boolean {
  // Validación liviana — class-validator ya validó upstream pero defendemos
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
