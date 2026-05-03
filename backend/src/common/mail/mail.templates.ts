/**
 * Templates HTML inline (sin engine externo). Brand-aligned con paleta oficial:
 *   - Azul Profundo  #0D1B2A (texto/headings)
 *   - Verde Principal #34B27A (CTA/accent)
 *   - Naranja Acento  #FF8A3D (warnings/highlights)
 *
 * Patrón de diseño:
 *   - Tabla outer (max-width 600px) para compatibilidad con clientes legacy
 *   - Inline styles (Gmail/Outlook strippean <style> en muchos casos)
 *   - Versión `text` plana para clientes sin HTML / accesibilidad / spam scoring
 */

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

const BRAND = {
  blue: '#0D1B2A',
  green: '#34B27A',
  greenSoft: '#E7F6EF',
  orange: '#FF8A3D',
  textMuted: '#5C6B7A',
  bg: '#F5F7F9',
  border: '#E2E8EC',
};

function shell(bodyHtml: string, footerNote: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.blue};">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#fff;border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 32px 8px 32px;border-bottom:1px solid ${BRAND.border};">
          <span style="font-size:20px;font-weight:700;color:${BRAND.blue};letter-spacing:-0.5px;">
            Nvet<span style="color:${BRAND.green};">Care</span>
          </span>
        </td></tr>
        <tr><td style="padding:24px 32px 32px 32px;font-size:15px;line-height:1.55;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 32px;background:${BRAND.bg};border-top:1px solid ${BRAND.border};font-size:12px;color:${BRAND.textMuted};">
          ${footerNote}<br />
          &copy; ${new Date().getFullYear()} Nvet Care &middot; Cartagena, Colombia
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background:${BRAND.green};border-radius:10px;">
      <a href="${url}" style="display:inline-block;padding:14px 24px;color:#fff;text-decoration:none;font-weight:600;font-size:15px;">
        ${label}
      </a>
    </td></tr>
  </table>`;
}

// ============================================================
// PASSWORD RESET
// ============================================================

export function passwordResetTemplate(params: {
  firstName: string;
  resetLink: string;
  expiresInMinutes: number;
}): RenderedMail {
  const subject = 'Recupera tu contraseña de Nvet Care';
  const html = shell(
    `<h1 style="margin:0 0 12px;font-size:22px;color:${BRAND.blue};">Hola ${escapeHtml(params.firstName)},</h1>
    <p style="margin:0 0 12px;">Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva. Este enlace expira en <strong>${params.expiresInMinutes} minutos</strong>.</p>
    ${ctaButton('Restablecer contraseña', params.resetLink)}
    <p style="margin:0 0 8px;color:${BRAND.textMuted};font-size:13px;">Si el botón no funciona, copia este enlace en tu navegador:</p>
    <p style="margin:0 0 16px;word-break:break-all;font-size:12px;background:${BRAND.bg};padding:10px;border-radius:6px;border:1px solid ${BRAND.border};">${params.resetLink}</p>
    <div style="margin-top:24px;padding:12px 16px;background:#FFF6EE;border-left:4px solid ${BRAND.orange};border-radius:6px;">
      <strong style="color:${BRAND.orange};">Importante:</strong> Si tú no solicitaste este cambio, ignora este correo. Tu contraseña actual seguirá funcionando y nadie podrá acceder a tu cuenta.
    </div>`,
    'Recibiste este correo porque alguien solicitó recuperar la contraseña asociada a tu cuenta.',
  );
  const text = `Hola ${params.firstName},

Recibimos una solicitud para restablecer tu contraseña.
Abre este enlace para crear una nueva (válido ${params.expiresInMinutes} minutos):

${params.resetLink}

Si tú no solicitaste este cambio, ignora este correo. Tu contraseña actual seguirá funcionando.

— Nvet Care`;
  return { subject, html, text };
}

// ============================================================
// EMAIL VERIFICATION
// ============================================================

export function emailVerificationTemplate(params: {
  firstName: string;
  verifyLink: string;
  expiresInHours: number;
}): RenderedMail {
  const subject = 'Verifica tu correo electrónico';
  const html = shell(
    `<h1 style="margin:0 0 12px;font-size:22px;color:${BRAND.blue};">¡Bienvenida/o, ${escapeHtml(params.firstName)}!</h1>
    <p style="margin:0 0 12px;">Para completar el registro y desbloquear todas las funciones de Nvet Care (agendar citas, pagos, chat con vets), confirma tu correo haciendo clic en el botón.</p>
    ${ctaButton('Verificar mi correo', params.verifyLink)}
    <p style="margin:0 0 8px;color:${BRAND.textMuted};font-size:13px;">Este enlace expira en <strong>${params.expiresInHours} horas</strong>. Si no funciona, copia esta URL:</p>
    <p style="margin:0 0 16px;word-break:break-all;font-size:12px;background:${BRAND.bg};padding:10px;border-radius:6px;border:1px solid ${BRAND.border};">${params.verifyLink}</p>
    <div style="margin-top:24px;padding:12px 16px;background:${BRAND.greenSoft};border-left:4px solid ${BRAND.green};border-radius:6px;">
      <strong style="color:${BRAND.green};">¿Por qué verificar?</strong> Para proteger tu cuenta, evitar suplantación y asegurar que solo tú recibes recordatorios de citas y comprobantes de pago.
    </div>`,
    'Recibiste este correo porque te registraste en Nvet Care con esta dirección.',
  );
  const text = `Hola ${params.firstName},

Confirma tu correo para activar tu cuenta de Nvet Care.
Este enlace expira en ${params.expiresInHours} horas:

${params.verifyLink}

Si no creaste esta cuenta, ignora este correo.

— Nvet Care`;
  return { subject, html, text };
}

// ============================================================
// HELPER: escape HTML básico
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
