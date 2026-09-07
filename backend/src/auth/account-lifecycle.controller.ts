import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle, seconds } from "@nestjs/throttler";

import { AccountLifecycleService } from "./account-lifecycle.service";
import { DeleteAccountDto } from "./dto/delete-account.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller()
export class AccountLifecycleController {
  constructor(
    private readonly accountLifecycleService: AccountLifecycleService,
  ) {}

  /**
   * Public HTTPS resource suitable for the Google Play account-deletion URL.
   * It deliberately contains no secrets or privileged credentials and routes
   * installed users into the authenticated self-service flow.
   */
  @Get("privacy/account-deletion")
  @Header("Content-Type", "text/html; charset=utf-8")
  accountDeletionPublicPage() {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Eliminar cuenta — Nvet Care</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:0 auto;padding:32px 20px;line-height:1.55;color:#1f2a1b;background:#fafaf7}
    main{background:#fff;border:1px solid #e3e7df;border-radius:18px;padding:28px}
    a{color:#496343;font-weight:700}.note{background:#f2f5ef;border-radius:12px;padding:14px}
  </style>
</head>
<body><main>
  <h1>Eliminar tu cuenta de Nvet Care</h1>
  <p>Puedes iniciar una solicitud de eliminación desde <strong>Perfil → Privacidad y cuenta → Eliminar cuenta</strong> en la aplicación Nvet Care.</p>
  <p><a href="nvetcare://profile">Abrir Nvet Care</a></p>
  <p>Por seguridad, una cuenta con citas activas, pagos o retiros sin resolver, disputas abiertas o saldo disponible debe resolver primero esas obligaciones. Las cuentas locales confirman la contraseña actual y las cuentas con 2FA también confirman su código.</p>
  <div class="note"><strong>Qué se elimina:</strong> credenciales y sesiones, datos de contacto del perfil, tokens de recuperación, notificaciones y datos operativos que ya no deban conservarse.</div>
  <p><strong>Qué puede conservarse:</strong> registros clínicos, financieros y de auditoría cuando sean necesarios para continuidad veterinaria, seguridad, prevención de fraude u obligaciones legales. Esos registros quedan desvinculados del perfil operativo mediante pseudonimización.</p>
  <p>Si no puedes iniciar sesión, utiliza primero el flujo <strong>Olvidé mi contraseña</strong> o el inicio de sesión de CTG One correspondiente a tu cuenta; después podrás completar la eliminación desde este flujo seguro.</p>
</main></body></html>`;
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
