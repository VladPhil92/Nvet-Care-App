import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle, seconds } from "@nestjs/throttler";

import { AccountLifecycleService } from "./account-lifecycle.service";
import {
  DeleteAccountDto,
  ExternalAccountDeletionConfirmDto,
  ExternalAccountDeletionRequestDto,
} from "./dto/delete-account.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller()
export class AccountLifecycleController {
  constructor(
    private readonly accountLifecycleService: AccountLifecycleService,
  ) {}

  /**
   * Public HTTPS resource for Google Play's outside-the-app deletion path.
   * The web flow works without an installed app: a user submits the account
   * email, receives a short-lived verification code, and confirms deletion on
   * this same resource. The mobile self-service flow remains available too.
   */
  @Get("privacy/account-deletion")
  @Header("Content-Type", "text/html; charset=utf-8")
  accountDeletionPublicPage() {
    return renderDeletionPage();
  }

  @Post("privacy/account-deletion/request")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Throttle({ default: { limit: 5, ttl: seconds(3600) } })
  async requestExternalDeletion(
    @Body() dto: ExternalAccountDeletionRequestDto,
  ) {
    const result = await this.accountLifecycleService.requestExternalDeletion(
      dto.email,
    );
    return renderDeletionPage(
      `<div class="notice"><strong>Solicitud recibida.</strong> ${escapeHtml(
        result.message,
      )}</div>`,
    );
  }

  @Post("privacy/account-deletion/confirm")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Throttle({ default: { limit: 10, ttl: seconds(3600) } })
  async confirmExternalDeletion(
    @Body() dto: ExternalAccountDeletionConfirmDto,
    @Res({ passthrough: true }) res: any,
  ) {
    try {
      const result =
        await this.accountLifecycleService.confirmExternalDeletion(
          dto.email,
          dto.verificationCode,
        );
      return renderDeletionPage(
        `<div class="success"><strong>Cuenta eliminada.</strong> ${escapeHtml(
          result.message,
        )}</div>`,
      );
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      res.status(error.getStatus());
      return renderDeletionPage(
        `<div class="error"><strong>No se pudo completar la eliminación.</strong> ${escapeHtml(
          extractHttpMessage(error),
        )}</div>`,
      );
    }
  }

  @Get("auth/account/deletion-readiness")
  @UseGuards(JwtAuthGuard)
  async deletionReadiness(@Req() req: any) {
    return this.accountLifecycleService.getDeletionReadiness(req.user.id);
  }

  @Delete("auth/account")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: seconds(900) } })
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
    @Body() dto: DeleteAccountDto,
  ) {
    const result = await this.accountLifecycleService.deleteAccount(
      req.user.id,
      dto,
    );

    // Browser dashboard sessions use this HttpOnly cookie. Native clients clear
    // Secure Storage after the response; both paths become unauthenticated.
    const production = process.env.NODE_ENV === "production";
    res.clearCookie("nvet_refresh", {
      httpOnly: true,
      secure: production,
      sameSite: production ? "none" : "lax",
      path: "/api/auth",
    });

    return result;
  }
}

function renderDeletionPage(feedback = ""): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Eliminar cuenta — Nvet Care</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:32px 20px;line-height:1.55;color:#1f2a1b;background:#fafaf7}
    main{background:#fff;border:1px solid #e3e7df;border-radius:18px;padding:28px}h1,h2{line-height:1.2}a{color:#496343;font-weight:700}
    form{display:grid;gap:10px;margin:16px 0 24px}label{font-weight:700}input{font:inherit;padding:11px 12px;border:1px solid #cfd5ca;border-radius:9px}
    button{font:inherit;font-weight:800;padding:12px 14px;border:0;border-radius:9px;background:#5b7553;color:#fff;cursor:pointer}.danger{background:#9b2c2c}
    .note,.notice,.success,.error{border-radius:12px;padding:14px;margin:14px 0}.note,.notice{background:#f2f5ef}.success{background:#edf7ed}.error{background:#fff1f1;color:#7b2020}
    hr{border:0;border-top:1px solid #e3e7df;margin:28px 0}
  </style>
</head>
<body><main>
  <h1>Eliminar tu cuenta de Nvet Care</h1>
  <p><strong>No necesitas tener la aplicación instalada para solicitar la eliminación.</strong> Usa este recurso web con el correo de tu cuenta. Te enviaremos un código temporal a ese correo para confirmar la solicitud.</p>
  ${feedback}
  <h2>1. Solicitar código de eliminación</h2>
  <form method="post" action="/api/privacy/account-deletion/request">
    <label for="request-email">Correo de la cuenta</label>
    <input id="request-email" name="email" type="email" autocomplete="email" maxlength="254" required />
    <button type="submit">Solicitar código</button>
  </form>
  <h2>2. Confirmar solicitud</h2>
  <p>Cuando recibas el código, vuelve a esta página. El código vence en 30 minutos.</p>
  <form method="post" action="/api/privacy/account-deletion/confirm">
    <label for="confirm-email">Correo de la cuenta</label>
    <input id="confirm-email" name="email" type="email" autocomplete="email" maxlength="254" required />
    <label for="verification-code">Código de eliminación</label>
    <input id="verification-code" name="verificationCode" type="text" inputmode="text" autocomplete="one-time-code" pattern="[0-9]{10}\\.[A-Fa-f0-9]{32}" required />
    <button class="danger" type="submit">Confirmar y eliminar cuenta</button>
  </form>
  <div class="note"><strong>Antes de eliminar:</strong> citas activas o en disputa, pagos sin resolver, saldo disponible o retiros abiertos deben resolverse primero para no perder continuidad clínica ni fondos. Si existe uno de esos bloqueos, el sistema lo indicará y podrás solicitar un nuevo código después de resolverlo.</div>
  <p><strong>Qué se elimina:</strong> credenciales y sesiones, correo y datos de contacto del perfil operativo, tokens de recuperación, notificaciones y datos que ya no deban conservarse.</p>
  <p><strong>Qué puede conservarse:</strong> registros clínicos, financieros, de verificación profesional o de auditoría cuando sean necesarios para continuidad veterinaria, seguridad, prevención de fraude u obligaciones legales. Esos registros quedan bajo un identificador pseudónimo e inactivo y no permiten volver a iniciar sesión.</p>
  <hr />
  <h2>Alternativa dentro de la app</h2>
  <p>También puedes usar <strong>Perfil → Privacidad y cuenta → Eliminar cuenta</strong> en Nvet Care. Ese flujo exige confirmación adicional y, según tu configuración, contraseña actual y 2FA.</p>
</main></body></html>`;
}

function extractHttpMessage(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === "string") return response;
  if (response && typeof response === "object" && "message" in response) {
    const message = (response as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "El código es inválido, expiró o la cuenta tiene obligaciones pendientes.";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
