import {
  IsEnum,
  IsString,
  IsOptional,
  IsDateString,
  Length,
  IsNotEmpty,
  Matches,
} from "class-validator";
import { DocumentType } from "@prisma/client";

/**
 * DTO para subir un documento de verificación.
 *
 * El archivo en sí viaja como `multipart/form-data` y se procesa
 * con `FileInterceptor`. Este DTO acompaña los metadatos del documento.
 */
export class UploadDocumentDto {
  @IsEnum(DocumentType, {
    message:
      "documentType debe ser COMVEZCOL_CARD, PROFESSIONAL_DEGREE, ID_DOCUMENT o ADDITIONAL",
  })
  documentType: DocumentType;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  documentNumber?: string;

  @IsOptional()
  @IsDateString()
  issuedDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  issuedBy?: string;
}

/**
 * DTO para que el admin apruebe un documento.
 */
export class ApproveDocumentDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;
}

/**
 * DTO para que el admin rechace un documento.
 * La razón es obligatoria para mantener trazabilidad.
 */
export class RejectDocumentDto {
  @IsString()
  @IsNotEmpty()
  @Length(10, 500, {
    message: "La razón de rechazo debe tener entre 10 y 500 caracteres",
  })
  reason: string;
}

/**
 * DTO para crear el perfil inicial del veterinario tras registro.
 * El COMVEZCOL number debe seguir formato XXXXXX-X.
 */
export class CreateVetProfileDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 30)
  licenseNumber: string;

  @IsOptional()
  @Matches(/^\d{4,6}-\d{1}$/, {
    message: "COMVEZCOL inválido. Formato esperado: XXXXXX-X (ej. 12345-6)",
  })
  comvezcolNumber?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  universityName?: string;

  @IsOptional()
  graduationYear?: number;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  bio?: string;

  @IsOptional()
  yearsExperience?: number;

  @IsOptional()
  specialties?: string[];
}
