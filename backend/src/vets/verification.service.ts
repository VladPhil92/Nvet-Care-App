import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { StorageService } from "../common/storage/storage.service";
import {
  DocumentType,
  DocumentStatus,
  VerificationStatus,
} from "@prisma/client";
import * as path from "path";
import * as crypto from "crypto";

// ============================================
// CONSTANTS
// ============================================

// Required documents for verification
const REQUIRED_DOCUMENTS: DocumentType[] = [
  DocumentType.COMVEZCOL_CARD,
  DocumentType.PROFESSIONAL_DEGREE,
  DocumentType.ID_DOCUMENT,
];

// Allowed file types
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
];

// Max file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// COMVEZCOL license number regex (format: ######-#)
const COMVEZCOL_REGEX = /^\d{4,6}-\d{1}$/;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private storage: StorageService,
  ) {}

  // ============================================
  // DOCUMENT UPLOAD
  // ============================================

  /**
   * Upload a verification document
   *
   * Flow:
   * 1. Validate file type and size
   * 2. Generate secure filename
   * 3. Save file to disk (or S3 in production)
   * 4. Create DB record
   * 5. Optionally trigger OCR / COMVEZCOL validation
   * 6. Update vet status to PENDING if all docs uploaded
   */
  async uploadDocument(
    userId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
    metadata?: {
      documentNumber?: string;
      issuedDate?: string;
      expiryDate?: string;
      issuedBy?: string;
    },
  ) {
    // Validations
    this.validateFile(file);

    // Get vet profile
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
    });

    if (!vet) {
      throw new NotFoundException(
        "Vet profile not found. Create profile first.",
      );
    }

    // Check if already approved
    if (vet.verificationStatus === VerificationStatus.APPROVED) {
      throw new BadRequestException(
        "Your account is already verified. Contact support to update documents.",
      );
    }

    // Check if document type already uploaded and approved
    const existing = await this.prisma.verificationDocument.findFirst({
      where: {
        vetProfileId: vet.id,
        type: documentType,
        status: { in: [DocumentStatus.UPLOADED, DocumentStatus.APPROVED] },
      },
    });

    if (existing && existing.status === DocumentStatus.APPROVED) {
      throw new ConflictException(
        `${documentType} is already approved. Cannot replace.`,
      );
    }

    // Upload file via StorageService (local or Cloudinary depending on STORAGE_DRIVER)
    const hash = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.originalname).toLowerCase();
    const uploaded = await this.storage.upload(file, `verification/${vet.id}`, {
      filename: `${documentType}_${hash}${ext}`,
    });
    const fileName = path.basename(uploaded.url);
    const fileUrl = uploaded.url;

    // Validate COMVEZCOL if applicable
    if (
      documentType === DocumentType.COMVEZCOL_CARD &&
      metadata?.documentNumber
    ) {
      this.validateComvezcolNumber(metadata.documentNumber);
    }

    // If existing UPLOADED doc, delete old file and update record
    if (existing && existing.status === DocumentStatus.UPLOADED) {
      await this.storage.delete(existing.fileUrl).catch(() => {});

      const updated = await this.prisma.verificationDocument.update({
        where: { id: existing.id },
        data: {
          fileName,
          fileUrl,
          fileMimeType: file.mimetype,
          fileSize: file.size,
          documentNumber: metadata?.documentNumber,
          issuedDate: metadata?.issuedDate
            ? new Date(metadata.issuedDate)
            : null,
          expiryDate: metadata?.expiryDate
            ? new Date(metadata.expiryDate)
            : null,
          issuedBy: metadata?.issuedBy,
          status: DocumentStatus.UPLOADED,
          reviewNotes: null,
        },
      });

      await this.updateVerificationStatus(vet.id);
      return updated;
    }

    // Create new document
    const doc = await this.prisma.verificationDocument.create({
      data: {
        vetProfileId: vet.id,
        type: documentType,
        fileName,
        fileUrl,
        fileMimeType: file.mimetype,
        fileSize: file.size,
        documentNumber: metadata?.documentNumber,
        issuedDate: metadata?.issuedDate ? new Date(metadata.issuedDate) : null,
        expiryDate: metadata?.expiryDate ? new Date(metadata.expiryDate) : null,
        issuedBy: metadata?.issuedBy,
        status: DocumentStatus.UPLOADED,
      },
    });

    // Update verification status if all required docs uploaded
    await this.updateVerificationStatus(vet.id);

    return doc;
  }

  /**
   * Get verification status with document list
   */
  async getVerificationStatus(userId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      include: {
        verificationDocuments: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    // Build status for each required document type
    const documentStatus = REQUIRED_DOCUMENTS.map((type) => {
      const docs = vet.verificationDocuments.filter((d) => d.type === type);
      const latest = docs[0];

      return {
        type,
        required: true,
        status: latest?.status || "NOT_UPLOADED",
        documentId: latest?.id,
        fileName: latest?.fileName,
        uploadedAt: latest?.uploadedAt,
        reviewNotes: latest?.reviewNotes,
        rejectionReason:
          latest?.status === DocumentStatus.REJECTED
            ? latest.reviewNotes
            : null,
      };
    });

    // Count required docs approved
    const approvedRequired = documentStatus.filter(
      (d) => d.status === DocumentStatus.APPROVED,
    ).length;

    const uploadedRequired = documentStatus.filter(
      (d) =>
        d.status === DocumentStatus.UPLOADED ||
        d.status === DocumentStatus.APPROVED,
    ).length;

    // Estimated review time
    const estimatedReviewHours =
      vet.verificationStatus === VerificationStatus.PENDING ? 48 : null;

    return {
      vetProfileId: vet.id,
      overallStatus: vet.verificationStatus,
      isVerified: vet.isVerified,
      verifiedAt: vet.verifiedAt,
      rejectionReason: vet.rejectionReason,
      progress: {
        approved: approvedRequired,
        uploaded: uploadedRequired,
        total: REQUIRED_DOCUMENTS.length,
        percentage: Math.round(
          (approvedRequired / REQUIRED_DOCUMENTS.length) * 100,
        ),
      },
      documents: documentStatus,
      canSubmit: uploadedRequired === REQUIRED_DOCUMENTS.length,
      estimatedReviewHours,
      nextSteps: this.getNextSteps(vet.verificationStatus, uploadedRequired),
    };
  }

  /**
   * Submit verification for review (all docs uploaded)
   */
  async submitForReview(userId: string) {
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
      include: {
        verificationDocuments: {
          where: {
            status: { in: [DocumentStatus.UPLOADED, DocumentStatus.APPROVED] },
          },
        },
      },
    });

    if (!vet) {
      throw new NotFoundException("Vet profile not found");
    }

    // Validate all required docs uploaded
    const uploadedTypes = new Set(vet.verificationDocuments.map((d) => d.type));
    const missingDocs = REQUIRED_DOCUMENTS.filter(
      (type) => !uploadedTypes.has(type),
    );

    if (missingDocs.length > 0) {
      throw new BadRequestException(
        `Missing required documents: ${missingDocs.join(", ")}`,
      );
    }

    // Update status to IN_REVIEW
    return this.prisma.vetProfile.update({
      where: { id: vet.id },
      data: {
        verificationStatus: VerificationStatus.IN_REVIEW,
      },
    });
  }

  // ============================================
  // ADMIN ACTIONS
  // ============================================

  /**
   * Admin: Approve a document
   */
  async approveDocument(
    adminUserId: string,
    documentId: string,
    notes?: string,
  ) {
    const doc = await this.prisma.verificationDocument.findUnique({
      where: { id: documentId },
      include: { vetProfile: true },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    const updated = await this.prisma.verificationDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.APPROVED,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });

    // Check if all required docs approved → auto-approve vet
    await this.checkAndApproveVet(doc.vetProfileId);

    return updated;
  }

  /**
   * Admin: Reject a document
   */
  async rejectDocument(
    adminUserId: string,
    documentId: string,
    reason: string,
  ) {
    const doc = await this.prisma.verificationDocument.findUnique({
      where: { id: documentId },
      include: { vetProfile: true },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException("Rejection reason is required");
    }

    const updated = await this.prisma.verificationDocument.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.REJECTED,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      },
    });

    // Update vet status to REJECTED
    await this.prisma.vetProfile.update({
      where: { id: doc.vetProfileId },
      data: {
        verificationStatus: VerificationStatus.REJECTED,
        rejectionReason: reason,
      },
    });

    return updated;
  }

  /**
   * Admin: Get pending verification requests
   */
  async getPendingVerifications(
    filters: { limit?: number; offset?: number } = {},
  ) {
    const { limit = 20, offset = 0 } = filters;

    const where = {
      verificationStatus: {
        in: [VerificationStatus.PENDING, VerificationStatus.IN_REVIEW],
      },
    };

    const [results, total] = await Promise.all([
      this.prisma.vetProfile.findMany({
        where,
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          verificationDocuments: {
            orderBy: { uploadedAt: "desc" },
          },
        },
        orderBy: { updatedAt: "asc" },
      }),
      this.prisma.vetProfile.count({ where }),
    ]);

    return { results, total, limit, offset, hasMore: offset + limit < total };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Validate uploaded file
   */
  private validateFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
      );
    }
  }

  /**
   * Validate COMVEZCOL license number format
   */
  private validateComvezcolNumber(licenseNumber: string) {
    if (!COMVEZCOL_REGEX.test(licenseNumber)) {
      throw new BadRequestException(
        "Invalid COMVEZCOL format. Expected: XXXXXX-X (e.g., 12345-6)",
      );
    }

    // TODO: In production, integrate with COMVEZCOL API for real-time validation
    // const isValid = await this.comvezcolApiClient.verify(licenseNumber);
  }

  /**
   * Update vet verification status based on uploaded documents
   */
  private async updateVerificationStatus(vetProfileId: string) {
    const docs = await this.prisma.verificationDocument.findMany({
      where: {
        vetProfileId,
        status: { in: [DocumentStatus.UPLOADED, DocumentStatus.APPROVED] },
      },
    });

    const uploadedTypes = new Set(docs.map((d) => d.type));
    const hasAllRequired = REQUIRED_DOCUMENTS.every((type) =>
      uploadedTypes.has(type),
    );

    const currentVet = await this.prisma.vetProfile.findUnique({
      where: { id: vetProfileId },
    });

    // If status is NONE or REJECTED and user just uploaded, move to PENDING
    if (
      hasAllRequired &&
      (currentVet.verificationStatus === VerificationStatus.NONE ||
        currentVet.verificationStatus === VerificationStatus.REJECTED)
    ) {
      await this.prisma.vetProfile.update({
        where: { id: vetProfileId },
        data: {
          verificationStatus: VerificationStatus.PENDING,
          rejectionReason: null,
        },
      });
    }
  }

  /**
   * Check if all required docs approved and auto-approve vet
   */
  private async checkAndApproveVet(vetProfileId: string) {
    const docs = await this.prisma.verificationDocument.findMany({
      where: {
        vetProfileId,
        status: DocumentStatus.APPROVED,
      },
    });

    const approvedTypes = new Set(docs.map((d) => d.type));
    const allApproved = REQUIRED_DOCUMENTS.every((type) =>
      approvedTypes.has(type),
    );

    if (allApproved) {
      const vet = await this.prisma.vetProfile.update({
        where: { id: vetProfileId },
        data: {
          verificationStatus: VerificationStatus.APPROVED,
          isVerified: true,
          isActive: true,
          verifiedAt: new Date(),
          rejectionReason: null,
        },
        include: {
          user: {
            select: { email: true, firstName: true },
          },
        },
      });

      const result = await this.mail.sendVetApproval({
        to: vet.user.email,
        firstName: vet.user.firstName ?? "Veterinario",
      });

      if (!result.ok) {
        this.logger.warn(
          `Vet approval email failed for vetProfileId=${vetProfileId}: ${result.error}`,
        );
      }
    }
  }

  /**
   * Get user-facing next steps based on status
   */
  private getNextSteps(
    status: VerificationStatus,
    uploadedCount: number,
  ): string[] {
    switch (status) {
      case VerificationStatus.NONE:
        return [
          `Sube ${REQUIRED_DOCUMENTS.length - uploadedCount} documento(s) restante(s)`,
          "Asegúrate que las imágenes sean claras y legibles",
        ];

      case VerificationStatus.PENDING:
        return [
          "Envía tus documentos a revisión",
          "El tiempo estimado de revisión es 24-48 horas",
        ];

      case VerificationStatus.IN_REVIEW:
        return [
          "Tu verificación está siendo revisada por nuestro equipo",
          "Te notificaremos por email cuando el proceso termine",
          "Tiempo estimado: 24-48 horas",
        ];

      case VerificationStatus.APPROVED:
        return [
          "¡Felicitaciones! Ya puedes ofrecer tus servicios",
          "Completa tu perfil con especialidades y precios",
          "Configura tu agenda y disponibilidad",
        ];

      case VerificationStatus.REJECTED:
        return [
          "Uno o más documentos fueron rechazados",
          "Revisa las notas del admin y vuelve a subir los documentos correctos",
        ];

      case VerificationStatus.EXPIRED:
        return [
          "Tus documentos están vencidos",
          "Sube versiones actualizadas para continuar ofreciendo servicios",
        ];

      default:
        return [];
    }
  }
}
