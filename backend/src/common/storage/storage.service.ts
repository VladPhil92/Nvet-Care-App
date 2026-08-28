import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export interface UploadResult {
  /** URL pública o path relativo para servir el archivo */
  url: string;
  /** Identificador del provider (public_id en Cloudinary, path en local) */
  storageKey: string;
  driver: "local" | "cloudinary";
}

/**
 * StorageService — capa de abstracción para uploads de archivos.
 *
 * Drivers:
 *   local      — guarda en UPLOAD_DIR/. Solo para desarrollo.
 *   cloudinary — sube a Cloudinary via su SDK.
 *                Requiere: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
 *                          CLOUDINARY_API_SECRET en el entorno.
 *
 * Selección vía STORAGE_DRIVER env var (default: local).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: "local" | "cloudinary";
  private readonly uploadDir: string;
  private readonly cloudinaryFolder: string;

  constructor() {
    const configured = (process.env.STORAGE_DRIVER ?? "").toLowerCase();
    this.driver = configured === "cloudinary" ? "cloudinary" : "local";

    this.uploadDir =
      process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

    this.cloudinaryFolder = process.env.CLOUDINARY_UPLOAD_FOLDER ?? "nvetcare";

    this.logger.log(`StorageService initialized: driver=${this.driver}`);

    if (this.driver === "cloudinary") {
      this.assertCloudinaryEnv();
    }
  }

  /**
   * Sube un archivo. Retorna la URL de acceso y el storageKey para borrado futuro.
   *
   * @param file    Buffer del archivo (viene de Multer memoryStorage)
   * @param folder  Subcarpeta lógica (ej. "verification", "transfers")
   * @param options.filename  Nombre base del archivo (sin extensión)
   * @param options.mimeType  MIME type para determinar extensión y content-type
   */
  async upload(
    file: Express.Multer.File,
    folder: string,
    options?: { filename?: string },
  ): Promise<UploadResult> {
    if (this.driver === "cloudinary") {
      return this.uploadToCloudinary(file, folder, options);
    }
    return this.uploadToLocal(file, folder, options);
  }

  /**
   * Elimina un archivo previamente subido.
   * En local: borra el fichero del disco.
   * En Cloudinary: llama destroy con el public_id.
   */
  async delete(storageKey: string): Promise<void> {
    if (this.driver === "cloudinary") {
      await this.deleteFromCloudinary(storageKey);
    } else {
      await this.deleteFromLocal(storageKey);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOCAL DRIVER
  // ─────────────────────────────────────────────────────────────────────────

  private async uploadToLocal(
    file: Express.Multer.File,
    folder: string,
    options?: { filename?: string },
  ): Promise<UploadResult> {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName =
      options?.filename ?? crypto.randomBytes(16).toString("hex");
    const fileName = `${baseName}${ext}`;

    const dir = path.join(this.uploadDir, folder);
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, fileName);
    try {
      await fs.writeFile(filePath, file.buffer);
    } catch (err) {
      this.logger.error(`Local upload failed: ${(err as Error).message}`);
      throw new InternalServerErrorException("No se pudo guardar el archivo");
    }

    const url = `/uploads/${folder}/${fileName}`;
    return { url, storageKey: filePath, driver: "local" };
  }

  private async deleteFromLocal(storageKey: string): Promise<void> {
    try {
      await fs.unlink(storageKey);
    } catch {
      this.logger.warn(`Local delete failed (non-fatal): ${storageKey}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLOUDINARY DRIVER
  // ─────────────────────────────────────────────────────────────────────────

  private async uploadToCloudinary(
    file: Express.Multer.File,
    folder: string,
    options?: { filename?: string },
  ): Promise<UploadResult> {
    // Lazy-require para no romper si el paquete no está instalado en dev local
    let cloudinary: any;
    try {
      cloudinary = (await import("cloudinary")).v2;
    } catch {
      throw new InternalServerErrorException(
        "Cloudinary no está instalado. Ejecuta: npm install cloudinary",
      );
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    const publicId = options?.filename
      ? `${this.cloudinaryFolder}/${folder}/${options.filename}`
      : `${this.cloudinaryFolder}/${folder}/${crypto.randomBytes(16).toString("hex")}`;

    // Cloudinary acepta un Buffer si lo envolvemos en un stream o como base64
    const base64 = file.buffer.toString("base64");
    const dataUri = `data:${file.mimetype};base64,${base64}`;

    try {
      const result = await cloudinary.uploader.upload(dataUri, {
        public_id: publicId,
        resource_type: "auto",
        overwrite: true,
      });

      return {
        url: result.secure_url,
        storageKey: result.public_id,
        driver: "cloudinary",
      };
    } catch (err) {
      this.logger.error(`Cloudinary upload failed: ${(err as Error).message}`);
      throw new InternalServerErrorException(
        "No se pudo subir el archivo a Cloudinary",
      );
    }
  }

  private async deleteFromCloudinary(publicId: string): Promise<void> {
    try {
      const cloudinary = (await import("cloudinary")).v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      this.logger.warn(
        `Cloudinary delete failed (non-fatal): ${publicId} — ${(err as Error).message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private assertCloudinaryEnv() {
    const required = [
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ];
    const missing = required.filter((v) => !process.env[v]);
    if (missing.length) {
      this.logger.error(
        `STORAGE_DRIVER=cloudinary pero faltan variables: ${missing.join(", ")}`,
      );
    }
  }
}
