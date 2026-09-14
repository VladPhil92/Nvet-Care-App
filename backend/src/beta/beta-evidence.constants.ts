export const BETA_EVIDENCE_PROGRAM = "closed-beta-cartagena" as const;
export const BETA_EVIDENCE_TARGET_TYPE = "BETA_EVIDENCE" as const;

// Phase 12/29 activation prerequisites. Keep this list stable: these gates are
// required before the controlled Cartagena beta can be authorized.
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

// Phase 36 evidence is collected only after a real beta build/cohort exists.
// These gates are intentionally NOT part of BETA_EVIDENCE_GATES so they cannot
// create a circular dependency that blocks initial beta activation.
export const PHASE_36_OBSERVATION_EVIDENCE_GATES = [
  "play-vitals-crash-free",
  "physical-device-matrix",
  "real-beta-cohort",
  "observation-window",
] as const;

export const ALL_BETA_EVIDENCE_GATES = [
  ...BETA_EVIDENCE_GATES,
  ...PHASE_36_OBSERVATION_EVIDENCE_GATES,
] as const;

export type BetaActivationEvidenceGate = (typeof BETA_EVIDENCE_GATES)[number];
export type Phase36ObservationEvidenceGate =
  (typeof PHASE_36_OBSERVATION_EVIDENCE_GATES)[number];
export type BetaEvidenceGate = (typeof ALL_BETA_EVIDENCE_GATES)[number];
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
