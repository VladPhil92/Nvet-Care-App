export const BETA_EVIDENCE_PROGRAM = "closed-beta-cartagena" as const;
export const BETA_EVIDENCE_TARGET_TYPE = "BETA_EVIDENCE" as const;

export const BETA_EVIDENCE_GATES = [
  "rcPromoted",
  "productionBackupConfigured",
  "restoreDrillVerified",
  "productionAlertingVerified",
  "paymentRailVerified",
  "cartagenaVetCoverageVerified",
  "clientCohortConfigured",
  "supportOwnerConfirmed",
  "privacyAndTermsReviewed",
  "rollbackDrillVerified",
] as const;

export type BetaEvidenceGate = (typeof BETA_EVIDENCE_GATES)[number];
export type BetaEvidenceEnvironment = "production" | "staging";
export type BetaEvidenceEventType =
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "REVOKED";

export type BetaEvidenceStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "REVOKED"
  | "EXPIRED"
  | "CONFLICTED";

export type BetaGateStatus = "PENDING" | "VERIFIED" | "CONFLICTED";
