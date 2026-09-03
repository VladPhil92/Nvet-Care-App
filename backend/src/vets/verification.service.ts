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

const REQUIRED_DOCUMENTS: DocumentType[] = [
  DocumentType.COMVEZCOL_CARD,
  DocumentType.PROFESSIONAL_DEGREE,
  DocumentType.ID_DOCUMENT,
];

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const COMVEZCOL_REGEX = /^\d{4,6}-\d{1}$/;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private storage: StorageService,
  ) {}

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
    this.validateFile(file);

    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId },
    });

    if (!vet) {
      throw new NotFoundException(
        "Vet profile not found. Create profile first.",
      );
    }

    if (vet.verificationStatus === VerificationStatus.APPROVED) {
      throw new BadRequestException(
        "Your account is already verified. Contact support to update documents.",
      );
    }

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

    const hash = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.originalname).toLowerCase();
    const storedFileName = `${documentType}_${hash}${ext}`;
    const uploaded = await this.storage.upload(file, `verification/${vet.id}`, {
      filename: `${documentType}_${hash}`,
    });
    const fileUrl = uploaded.storageKey;

    if (
      documentType === DocumentType.COMVEZCOL_CARD &&
      metadata?.documentNumber
    ) {
      this.validateComvezcolNumber(metadata.documentNumber);
    }

    if (existing && existing.status === DocumentStatus.UPLOADED) {
      await this.storage.delete(existing.fileUrl).catch(() => {});

      const updated = await this.prisma.verificationDocument.update({
        where: { id: existing.id },
        data: {
          fileName: storedFileName,
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
      return this.toVetSafeDocument(updated);
    }

    const doc = await this.prisma.verificationDocument.create({
      data: {
        vetProfileId: vet.id,
        type: documentType,
        fileName: storedFileName,
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

    await this.updateVerificationStatus(vet.id);
    return this.toVetSafeDocument(doc);
  }

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

    const approvedRequired = documentStatus.filter(
      (d) => d.status === DocumentStatus.APPROVED,
    ).length;

    const uploadedRequired = documentStatus.filter(
      (d) =>
        d.status === DocumentStatus.UPLOADED ||
        d.status === DocumentStatus.APPROVED,
    ).length;

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

    const uploadedTypes = new Set(vet.verificationDocuments.map((d) => d.type));
    const missingDocs = REQUIRED_DOCUMENTS.filter(
      (type) => !uploadedTypes.has(type),
    );

    if (missingDocs.length > 0) {
      throw new BadRequestException(
        `Missing required documents: ${missingDocs.join(", ")}`,
      );
    }

    return this.prisma.vetProfile.update({
      where: { id: vet.id },
      data: {
        verificationStatus: VerificationStatus.IN_REVIEW,
      },
    });
  }

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

    await this.checkAndApproveVet(doc.vetProfileId);
    return this.toAdminSafeDocument(updated);
  }

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

    await this.prisma.vetProfile.update({
      where: { id: doc.vetProfileId },
      data: {
        verificationStatus: VerificationStatus.REJECTED,
        rejectionReason: reason,
      },
    });

    return this.toAdminSafeDocument(updated);
  }

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

    return {
      results: results.map((vet) => ({
        ...vet,
        verificationDocuments: vet.verificationDocuments.map((doc) =>
          this.toAdminSafeDocument(doc),
        ),
      })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  async readVerificationDocument(documentId: string) {
    const doc = await this.prisma.verificationDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        fileMimeType: true,
        fileSize: true,
      },
    });

    if (!doc) {
      throw new NotFoundException("Document not found");
    }

    const buffer = await this.storage.read(doc.fileUrl);
    return {
      buffer,
      fileName: this.sanitizeDownloadName(doc.fileName),
      mimeType: doc.fileMimeType,
      expectedSize: doc.fileSize,
    };
  }

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

  private validateComvezcolNumber(licenseNumber: string) {
    if (!COMVEZCOL_REGEX.test(licenseNumber)) {
      throw new BadRequestException(
        "Invalid COMVEZCOL format. Expected: XXXXXX-X (e.g., 12345-6)",
      );
    }

    // This is format validation + manual documentary review only. Integrate an
    // authoritative registry interface if/when COMVEZCOL exposes one.
  }

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

    if (
      hasAllRequired &&
      (currentVet?.verificationStatus === VerificationStatus.NONE ||
        currentVet?.verificationStatus === VerificationStatus.REJECTED)
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
          `Vet approval email failed for vetProfileId=${vetProfileId}: ${result.reason}`,
        );
      }
    }
  }

  private toVetSafeDocument(doc: any) {
    const { fileUrl: _fileUrl, ...safe } = doc;
    return safe;
  }

  private toAdminSafeDocument(doc: any) {
    const { fileUrl: _fileUrl, ...safe } = doc;
    return {
      ...safe,
      fileEndpoint: `/api/vets/admin/documents/${doc.id}/file`,
    };
  }

  private sanitizeDownloadName(name: string): string {
    const basename = path.basename(name || "verification-document");
    return basename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
  }

  private getNextSteps(status: VerificationStatus, uploadedCount: number) {
    switch (status) {
      case VerificationStatus.NONE:
        return uploadedCount === 0
          ? "Upload required documents to begin verification"
          : `Upload ${REQUIRED_DOCUMENTS.length - uploadedCount} remaining document(s)`;
      case VerificationStatus.PENDING:
        return "Submit your documents for review";
      case VerificationStatus.IN_REVIEW:
        return "Your documents are being reviewed. We'll notify you when complete";
      case VerificationStatus.APPROVED:
        return "Your account is verified and active";
      case VerificationStatus.REJECTED:
        return "Review the rejection reason and re-upload corrected documents";
      case VerificationStatus.EXPIRED:
        return "One or more documents have expired. Please upload current versions";
      default:
        return "Contact support if you need assistance";
    }
  }
}
