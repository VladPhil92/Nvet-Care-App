import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export type StorageVisibility = "public" | "private";

export interface UploadResult {
  /** Public URL or opaque private locator. Never expose private locators publicly. */
  url: string;
  /** Stable provider key used for delete/read operations. */
  storageKey: string;
  driver: "local" | "cloudinary";
  visibility: StorageVisibility;
}

interface ParsedCloudinaryKey {
  visibility: StorageVisibility;
  resourceType: string;
  publicId: string;
}

/**
 * StorageService — centralized file-storage boundary.
 *
 * Sensitive domains (verification documents, transfer evidence) must call
 * upload(..., { visibility: "private" }). Private Cloudinary assets use
 * authenticated delivery and are only read through this backend service.
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
    } else if (process.env.NODE_ENV === "production") {
      throw new Error(
        "STORAGE_DRIVER=local is not allowed in production for Nvet Care",
      );
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string,
    options?: { filename?: string; visibility?: StorageVisibility },
  ): Promise<UploadResult> {
    const visibility = options?.visibility ?? "public";
    if (this.driver === "cloudinary") {
      return this.uploadToCloudinary(file, folder, {
        filename: options?.filename,
        visibility,
      });
    }
    return this.uploadToLocal(file, folder, {
      filename: options?.filename,
      visibility,
    });
  }

  async delete(storageKey: string): Promise<void> {
    if (!storageKey) return;
    if (this.driver === "cloudinary") {
      await this.deleteFromCloudinary(storageKey);
    } else {
      await this.deleteFromLocal(storageKey);
    }
  }

  /** Read a private asset without exposing provider credentials/URLs. */
  async read(storageKey: string): Promise<Buffer> {
    if (!storageKey) {
      throw new InternalServerErrorException("Archivo sin storage key");
    }
    if (this.driver === "cloudinary") {
      return this.readFromCloudinary(storageKey);
    }
    return this.readFromLocal(storageKey);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOCAL DRIVER — development/test only
  // ─────────────────────────────────────────────────────────────────────────

  private async uploadToLocal(
    file: Express.Multer.File,
    folder: string,
    options: { filename?: string; visibility: StorageVisibility },
  ): Promise<UploadResult> {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = options.filename ?? crypto.randomBytes(16).toString("hex");
    const fileName = `${baseName}${ext}`;

    const dir = path.join(this.uploadDir, options.visibility, folder);
    await fs.mkdir(dir, { recursive: true });

    const filePath = path.join(dir, fileName);
    try {
      await fs.writeFile(filePath, file.buffer, { mode: 0o600 });
    } catch (err) {
      this.logger.error(`Local upload failed: ${(err as Error).message}`);
      throw new InternalServerErrorException("No se pudo guardar el archivo");
    }

    const url =
      options.visibility === "public"
        ? `/uploads/public/${folder}/${fileName}`
        : `private://local/${folder}/${fileName}`;

    return {
      url,
      storageKey: filePath,
      driver: "local",
      visibility: options.visibility,
    };
  }

  private async deleteFromLocal(storageKey: string): Promise<void> {
    const filePath = this.resolveLocalStorageKey(storageKey);
    try {
      await fs.unlink(filePath);
    } catch {
      this.logger.warn(`Local delete failed (non-fatal): ${filePath}`);
    }
  }

  private async readFromLocal(storageKey: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.resolveLocalStorageKey(storageKey));
    } catch (err) {
      this.logger.error(`Local read failed: ${(err as Error).message}`);
      throw new InternalServerErrorException("No se pudo leer el archivo");
    }
  }

  private resolveLocalStorageKey(storageKey: string): string {
    if (path.isAbsolute(storageKey)) return storageKey;

    // Legacy records stored /uploads/<folder>/<file>. Keep migration readable.
    if (storageKey.startsWith("/uploads/")) {
      return path.join(this.uploadDir, storageKey.replace(/^\/uploads\//, ""));
    }

    if (storageKey.startsWith("private://local/")) {
      return path.join(
        this.uploadDir,
        "private",
        storageKey.replace("private://local/", ""),
      );
    }

    return path.join(this.uploadDir, storageKey);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CLOUDINARY DRIVER
  // ─────────────────────────────────────────────────────────────────────────

  private async uploadToCloudinary(
    file: Express.Multer.File,
    folder: string,
    options: { filename?: string; visibility: StorageVisibility },
  ): Promise<UploadResult> {
    const cloudinary = await this.getCloudinary();
    const publicId = options.filename
      ? `${this.cloudinaryFolder}/${folder}/${options.filename}`
      : `${this.cloudinaryFolder}/${folder}/${crypto.randomBytes(16).toString("hex")}`;

    const base64 = file.buffer.toString("base64");
    const dataUri = `data:${file.mimetype};base64,${base64}`;

    try {
      const result = await cloudinary.uploader.upload(dataUri, {
        public_id: publicId,
        resource_type: "auto",
        type: options.visibility === "private" ? "authenticated" : "upload",
        overwrite: true,
        invalidate: true,
      });

      const storageKey = this.encodeCloudinaryKey({
        visibility: options.visibility,
        resourceType: result.resource_type || "image",
        publicId: result.public_id,
      });

      return {
        url:
          options.visibility === "public"
            ? result.secure_url
            : `private://cloudinary/${result.public_id}`,
        storageKey,
        driver: "cloudinary",
        visibility: options.visibility,
      };
    } catch (err) {
      this.logger.error(`Cloudinary upload failed: ${(err as Error).message}`);
      throw new InternalServerErrorException(
        "No se pudo subir el archivo a almacenamiento seguro",
      );
    }
  }

  private async deleteFromCloudinary(storageKey: string): Promise<void> {
    try {
      const cloudinary = await this.getCloudinary();
      const parsed = this.parseCloudinaryKey(storageKey);
      await cloudinary.uploader.destroy(parsed.publicId, {
        resource_type: parsed.resourceType,
        type: parsed.visibility === "private" ? "authenticated" : "upload",
        invalidate: true,
      });
    } catch (err) {
      this.logger.warn(
        `Cloudinary delete failed (non-fatal): ${(err as Error).message}`,
      );
    }
  }

  private async readFromCloudinary(storageKey: string): Promise<Buffer> {
    try {
      // Legacy public URLs remain readable during migration without exposing
      // them in new API responses.
      if (/^https:\/\//i.test(storageKey)) {
        return this.fetchBuffer(storageKey);
      }

      const cloudinary = await this.getCloudinary();
      const parsed = this.parseCloudinaryKey(storageKey);
      const url = cloudinary.url(parsed.publicId, {
        resource_type: parsed.resourceType,
        type: parsed.visibility === "private" ? "authenticated" : "upload",
        sign_url: parsed.visibility === "private",
        secure: true,
      });
      return this.fetchBuffer(url);
    } catch (err) {
      this.logger.error(`Cloudinary read failed: ${(err as Error).message}`);
      throw new InternalServerErrorException("No se pudo leer el archivo seguro");
    }
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Storage provider returned ${response.status}`);
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 12 * 1024 * 1024) {
      throw new Error("Stored asset exceeds secure read limit");
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 12 * 1024 * 1024) {
      throw new Error("Stored asset exceeds secure read limit");
    }
    return Buffer.from(bytes);
  }

  private encodeCloudinaryKey(input: ParsedCloudinaryKey): string {
    const encodedPublicId = Buffer.from(input.publicId, "utf8").toString("base64url");
    return `cloudinary:v1:${input.visibility}:${input.resourceType}:${encodedPublicId}`;
  }

  private parseCloudinaryKey(storageKey: string): ParsedCloudinaryKey {
    if (storageKey.startsWith("cloudinary:v1:")) {
      const [, , visibility, resourceType, encodedPublicId] = storageKey.split(":");
      if (
        (visibility !== "public" && visibility !== "private") ||
        !resourceType ||
        !encodedPublicId
      ) {
        throw new Error("Invalid Cloudinary storage key");
      }
      return {
        visibility,
        resourceType,
        publicId: Buffer.from(encodedPublicId, "base64url").toString("utf8"),
      };
    }

    if (storageKey.startsWith("private://cloudinary/")) {
      return {
        visibility: "private",
        resourceType: "image",
        publicId: storageKey.replace("private://cloudinary/", ""),
      };
    }

    // Legacy secure_url format: .../upload/v123/nvetcare/folder/file.ext
    if (/^https:\/\//i.test(storageKey)) {
      const url = new URL(storageKey);
      const marker = "/upload/";
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        const tail = url.pathname.slice(idx + marker.length).replace(/^v\d+\//, "");
        return {
          visibility: "public",
          resourceType: "image",
          publicId: tail.replace(/\.[a-z0-9]+$/i, ""),
        };
      }
    }

    return { visibility: "public", resourceType: "image", publicId: storageKey };
  }

  private async getCloudinary(): Promise<any> {
    try {
      const cloudinary = (await import("cloudinary")).v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
      return cloudinary;
    } catch {
      throw new InternalServerErrorException("Cloudinary no está disponible");
    }
  }

  private assertCloudinaryEnv() {
    const required = [
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ];
    const missing = required.filter((v) => !process.env[v]);
    if (missing.length) {
      const message = `STORAGE_DRIVER=cloudinary pero faltan variables: ${missing.join(", ")}`;
      this.logger.error(message);
      if (process.env.NODE_ENV === "production") {
        throw new Error(message);
      }
    }
  }
}
