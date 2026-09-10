import { Injectable } from "@nestjs/common";
import {
  DocumentStatus,
  DocumentType,
  VerificationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CoverageService } from "./coverage.service";
import { MIN_VERIFIED_GEO_READY_VETS_PER_MARKET } from "./coverage.constants";

const CARTAGENA_DANE = "13001";
const REQUIRED_DOCUMENTS: DocumentType[] = [
  DocumentType.COMVEZCOL_CARD,
  DocumentType.PROFESSIONAL_DEGREE,
  DocumentType.ID_DOCUMENT,
];

type ActivationBlocker =
  | "SERVICE_AREA_MISSING"
  | "SERVICE_AREA_MISMATCH"
  | "DOCUMENTS_MISSING"
  | "VET_SUBMISSION_REQUIRED"
  | "DOCUMENT_REVIEW_REQUIRED"
  | "DOCUMENT_REJECTED"
  | "REGISTRY_CHECK_REQUIRED"
  | "REGISTRY_NOT_VERIFIED"
  | "ACTIVATION_INCONSISTENT";

@Injectable()
export class CartagenaVetActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageService,
  ) {}

  async getSnapshot() {
    const profiles = await this.prisma.vetProfile.findMany({
      select: {
        id: true,
        userId: true,
        licenseNumber: true,
        comvezcolNumber: true,
        city: true,
        department: true,
        latitude: true,
        longitude: true,
        serviceRadius: true,
        verificationStatus: true,
        isVerified: true,
        isActive: true,
        verifiedAt: true,
        updatedAt: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        verificationDocuments: {
          select: {
            id: true,
            type: true,
            status: true,
            fileName: true,
            uploadedAt: true,
            reviewedAt: true,
            reviewNotes: true,
          },
          orderBy: { uploadedAt: "desc" },
        },
        professionalRegistryCheck: {
          select: {
            status: true,
            checkedAt: true,
            sourceUrl: true,
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    });

    const cartagenaProfiles = profiles.filter(
      (profile) =>
        this.coverage.resolveMarketByCity(profile.city, profile.department)
          ?.daneCode === CARTAGENA_DANE,
    );

    const candidates = cartagenaProfiles.map((profile) => {
      const serviceAreaComplete = this.hasServiceArea(profile);
      const geoConsistent = this.coverage.isVetServiceAreaConsistent(profile);
      const latestRequiredDocuments = REQUIRED_DOCUMENTS.map((type) => {
        const document = profile.verificationDocuments.find(
          (candidate) => candidate.type === type,
        );
        return {
          type,
          id: document?.id ?? null,
          status: document?.status ?? "NOT_UPLOADED",
          fileName: document?.fileName ?? null,
          uploadedAt: document?.uploadedAt ?? null,
          reviewedAt: document?.reviewedAt ?? null,
          reviewNotes: document?.reviewNotes ?? null,
        };
      });

      const uploadedRequired = latestRequiredDocuments.filter(
        (document) => document.status !== "NOT_UPLOADED",
      ).length;
      const approvedRequired = latestRequiredDocuments.filter(
        (document) => document.status === DocumentStatus.APPROVED,
      ).length;
      const rejectedRequired = latestRequiredDocuments.filter(
        (document) => document.status === DocumentStatus.REJECTED,
      ).length;
      const registryStatus = profile.professionalRegistryCheck?.status ?? "PENDING";
      const registryVerified = registryStatus === "VERIFIED";
      const operationalReady =
        profile.verificationStatus === VerificationStatus.APPROVED &&
        profile.isVerified &&
        profile.isActive &&
        geoConsistent &&
        approvedRequired === REQUIRED_DOCUMENTS.length &&
        registryVerified;
      const blockers = this.resolveBlockers({
        serviceAreaComplete,
        geoConsistent,
        uploadedRequired,
        approvedRequired,
        rejectedRequired,
        verificationStatus: profile.verificationStatus,
        registryStatus,
        operationalReady,
      });

      return {
        vetProfileId: profile.id,
        userId: profile.userId,
        displayName:
          [profile.user.firstName, profile.user.lastName]
            .filter(Boolean)
            .join(" ") || "Veterinario sin nombre",
        email: profile.user.email,
        licenseNumber: profile.licenseNumber,
        comvezcolNumber: profile.comvezcolNumber,
        city: profile.city,
        department: profile.department,
        serviceRadiusKm: profile.serviceRadius,
        serviceAreaComplete,
        geoConsistent,
        verificationStatus: profile.verificationStatus,
        isDocumentVerified: profile.isVerified,
        isActive: profile.isActive,
        verifiedAt: profile.verifiedAt,
        documents: {
          required: REQUIRED_DOCUMENTS.length,
          uploaded: uploadedRequired,
          approved: approvedRequired,
          rejected: rejectedRequired,
          items: latestRequiredDocuments,
        },
        registry: {
          status: registryStatus,
          checkedAt: profile.professionalRegistryCheck?.checkedAt ?? null,
          sourceUrl: profile.professionalRegistryCheck?.sourceUrl ?? null,
        },
        operationalReady,
        blockers,
        nextAction: this.nextAction(blockers, operationalReady),
        updatedAt: profile.updatedAt,
      } as const;
    });

    const operationalReady = candidates.filter(
      (candidate) => candidate.operationalReady,
    ).length;
    const coverageGap = Math.max(
      0,
      MIN_VERIFIED_GEO_READY_VETS_PER_MARKET - operationalReady,
    );
    const generatedAt = new Date().toISOString();
    const formalEvidenceEligible = coverageGap === 0;

    return {
      phase: 18,
      program: "cartagena-vet-supply-activation",
      market: {
        daneCode: CARTAGENA_DANE,
        city: "Cartagena de Indias",
        department: "Bolívar",
      },
      minimumOperationalVets: MIN_VERIFIED_GEO_READY_VETS_PER_MARKET,
      operationalReady,
      coverageGap,
      supplyActivationReady: formalEvidenceEligible,
      candidateCount: candidates.length,
      formalEvidence: {
        gateId: "cartagena-vet-coverage",
        evidenceKind: "runtime-snapshot",
        eligible: formalEvidenceEligible,
        submissionMustRemainManual: true,
        reference: formalEvidenceEligible
          ? `Cartagena DANE ${CARTAGENA_DANE}: ${operationalReady}/${MIN_VERIFIED_GEO_READY_VETS_PER_MARKET} operational geo-ready veterinarians verified by runtime snapshot at ${generatedAt}.`
          : `NOT ELIGIBLE: Cartagena DANE ${CARTAGENA_DANE} has ${operationalReady}/${MIN_VERIFIED_GEO_READY_VETS_PER_MARKET} operational geo-ready veterinarians; gap=${coverageGap}.`,
      },
      privacyBoundary:
        "Admin-only operational view. Exact veterinarian coordinates and document storage URLs are never returned.",
      commercialLaunchAuthorized: false,
      candidates,
      generatedAt,
    } as const;
  }

  private hasServiceArea(profile: {
    latitude: number | null;
    longitude: number | null;
    serviceRadius: number;
  }): boolean {
    return (
      profile.latitude != null &&
      profile.longitude != null &&
      Number.isFinite(profile.latitude) &&
      Number.isFinite(profile.longitude) &&
      Number.isFinite(profile.serviceRadius) &&
      profile.serviceRadius > 0
    );
  }

  private resolveBlockers(input: {
    serviceAreaComplete: boolean;
    geoConsistent: boolean;
    uploadedRequired: number;
    approvedRequired: number;
    rejectedRequired: number;
    verificationStatus: VerificationStatus;
    registryStatus: string;
    operationalReady: boolean;
  }): ActivationBlocker[] {
    if (input.operationalReady) return [];
    const blockers: ActivationBlocker[] = [];
    if (!input.serviceAreaComplete) blockers.push("SERVICE_AREA_MISSING");
    else if (!input.geoConsistent) blockers.push("SERVICE_AREA_MISMATCH");

    if (input.rejectedRequired > 0) blockers.push("DOCUMENT_REJECTED");
    if (input.uploadedRequired < REQUIRED_DOCUMENTS.length) {
      blockers.push("DOCUMENTS_MISSING");
    } else if (input.verificationStatus === VerificationStatus.PENDING) {
      blockers.push("VET_SUBMISSION_REQUIRED");
    }

    if (
      input.verificationStatus === VerificationStatus.IN_REVIEW ||
      (input.uploadedRequired === REQUIRED_DOCUMENTS.length &&
        input.approvedRequired < REQUIRED_DOCUMENTS.length &&
        input.rejectedRequired === 0)
    ) {
      blockers.push("DOCUMENT_REVIEW_REQUIRED");
    }

    if (input.registryStatus === "PENDING") {
      blockers.push("REGISTRY_CHECK_REQUIRED");
    } else if (input.registryStatus !== "VERIFIED") {
      blockers.push("REGISTRY_NOT_VERIFIED");
    }

    if (
      input.verificationStatus === VerificationStatus.APPROVED &&
      input.approvedRequired === REQUIRED_DOCUMENTS.length &&
      input.registryStatus === "VERIFIED" &&
      input.geoConsistent &&
      !input.operationalReady
    ) {
      blockers.push("ACTIVATION_INCONSISTENT");
    }

    return [...new Set(blockers)];
  }

  private nextAction(
    blockers: ActivationBlocker[],
    operationalReady: boolean,
  ): string {
    if (operationalReady) return "READY_FOR_CARTAGENA_SUPPLY";
    const priority: ActivationBlocker[] = [
      "SERVICE_AREA_MISSING",
      "SERVICE_AREA_MISMATCH",
      "DOCUMENT_REJECTED",
      "DOCUMENTS_MISSING",
      "VET_SUBMISSION_REQUIRED",
      "DOCUMENT_REVIEW_REQUIRED",
      "REGISTRY_CHECK_REQUIRED",
      "REGISTRY_NOT_VERIFIED",
      "ACTIVATION_INCONSISTENT",
    ];
    return priority.find((blocker) => blockers.includes(blocker)) ?? "REVIEW_REQUIRED";
  }
}
