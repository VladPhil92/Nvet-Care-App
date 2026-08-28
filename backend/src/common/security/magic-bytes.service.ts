import { Injectable, BadRequestException } from "@nestjs/common";

/**
 * MagicBytesValidator — valida el tipo de archivo inspeccionando los
 * primeros bytes (file signature / magic numbers).
 *
 * Razón crítica: el cliente puede enviar un .exe disfrazado como
 * `image/jpeg`. Multer solo verifica el header `Content-Type`,
 * que es trivial de falsificar.
 *
 * Esta validación se hace en server-side ANTES de persistir el archivo,
 * y rechaza si el contenido real no coincide con lo declarado.
 *
 * Referencias:
 *  - https://en.wikipedia.org/wiki/List_of_file_signatures
 *  - https://www.iana.org/assignments/media-types/media-types.xhtml
 */

export type AllowedMime = "image/jpeg" | "image/png" | "application/pdf";

interface FileSignature {
  mime: AllowedMime;
  /** Bytes esperados al inicio del archivo. `null` significa "cualquier byte". */
  signatures: Array<Array<number | null>>;
  /** Offset desde el inicio donde empieza la firma (default 0) */
  offset?: number;
}

/**
 * Tabla de firmas conocidas para los tipos permitidos.
 * Algunos formatos tienen múltiples variantes válidas.
 */
const KNOWN_SIGNATURES: FileSignature[] = [
  // JPEG: FF D8 FF (3 bytes mínimos; el cuarto byte varía: E0=JFIF, E1=EXIF, etc.)
  {
    mime: "image/jpeg",
    signatures: [[0xff, 0xd8, 0xff]],
  },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: "image/png",
    signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  },
  // PDF: 25 50 44 46 ("%PDF")
  {
    mime: "application/pdf",
    signatures: [[0x25, 0x50, 0x44, 0x46]],
  },
];

/**
 * Firmas peligrosas que SIEMPRE deben rechazarse (incluso si el cliente
 * declara un MIME permitido). Esto detecta el clásico "subir un .exe
 * con extensión .jpg".
 */
const FORBIDDEN_SIGNATURES: Array<{ name: string; bytes: number[] }> = [
  { name: "Windows PE (exe/dll)", bytes: [0x4d, 0x5a] }, // MZ
  { name: "ELF (linux exe)", bytes: [0x7f, 0x45, 0x4c, 0x46] }, // \x7fELF
  { name: "Mach-O (macOS exe)", bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: "Java class", bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { name: "ZIP/JAR/Office", bytes: [0x50, 0x4b, 0x03, 0x04] }, // PK..
  { name: "Shell script", bytes: [0x23, 0x21] }, // #!
  { name: "HTML", bytes: [0x3c, 0x21, 0x44, 0x4f] }, // <!DO
  { name: "HTML", bytes: [0x3c, 0x68, 0x74, 0x6d] }, // <htm
  { name: "HTML", bytes: [0x3c, 0x73, 0x63, 0x72] }, // <scr (script)
];

@Injectable()
export class MagicBytesValidator {
  /**
   * Valida que el archivo tenga el MIME real declarado.
   * Throws BadRequestException si:
   *  - el archivo es muy corto
   *  - el contenido coincide con una firma prohibida
   *  - el contenido no coincide con el MIME declarado
   */
  validate(file: Express.Multer.File, expectedMime: AllowedMime): void {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException("Archivo vacío");
    }

    if (file.buffer.length < 8) {
      throw new BadRequestException(
        "Archivo demasiado pequeño para ser válido",
      );
    }

    // 1. Rechazar firmas peligrosas (no importa lo que el cliente declare)
    this.checkForbiddenSignatures(file.buffer);

    // 2. Verificar que el contenido coincida con el MIME declarado
    const signature = KNOWN_SIGNATURES.find((s) => s.mime === expectedMime);
    if (!signature) {
      throw new BadRequestException(`MIME type no soportado: ${expectedMime}`);
    }

    const matches = signature.signatures.some((sig) =>
      this.matchesSignature(file.buffer, sig, signature.offset ?? 0),
    );

    if (!matches) {
      throw new BadRequestException(
        `El contenido del archivo no coincide con el tipo declarado (${expectedMime}). ` +
          "Posible intento de subir un archivo con extensión falsificada.",
      );
    }
  }

  /**
   * Detecta el MIME real del archivo (best-effort).
   * Útil cuando queremos auto-descubrir en lugar de validar contra esperado.
   */
  detect(file: Express.Multer.File): AllowedMime | null {
    if (!file?.buffer || file.buffer.length < 8) return null;
    for (const sig of KNOWN_SIGNATURES) {
      const matches = sig.signatures.some((s) =>
        this.matchesSignature(file.buffer, s, sig.offset ?? 0),
      );
      if (matches) return sig.mime;
    }
    return null;
  }

  // ----------------------------------------------------------
  // PRIVATE
  // ----------------------------------------------------------

  private checkForbiddenSignatures(buffer: Buffer): void {
    for (const forbidden of FORBIDDEN_SIGNATURES) {
      if (this.matchesSignature(buffer, forbidden.bytes, 0)) {
        throw new BadRequestException(
          `Tipo de archivo prohibido detectado: ${forbidden.name}`,
        );
      }
    }
  }

  /**
   * Compara los primeros bytes del buffer con una firma esperada.
   * Soporta wildcards (`null` en la firma matchea cualquier byte).
   */
  private matchesSignature(
    buffer: Buffer,
    signature: Array<number | null>,
    offset: number,
  ): boolean {
    if (buffer.length < offset + signature.length) return false;
    for (let i = 0; i < signature.length; i++) {
      const expected = signature[i];
      if (expected === null) continue; // wildcard
      if (buffer[offset + i] !== expected) return false;
    }
    return true;
  }
}
