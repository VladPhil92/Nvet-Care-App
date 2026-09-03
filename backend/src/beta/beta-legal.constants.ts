export const BETA_LEGAL_PROGRAM = "closed-beta-cartagena";
export const BETA_TERMS_VERSION = "cartagena-beta-terms-v1-2026-09-03";
export const BETA_PRIVACY_VERSION = "cartagena-beta-privacy-v1-2026-09-03";
export const BETA_LEGAL_EFFECTIVE_AT = "2026-09-03";

export const BETA_LEGAL_DOCUMENTS = {
  program: BETA_LEGAL_PROGRAM,
  effectiveAt: BETA_LEGAL_EFFECTIVE_AT,
  terms: {
    version: BETA_TERMS_VERSION,
    document: "docs/legal/NVET_CARTAGENA_BETA_TERMS.md",
  },
  privacy: {
    version: BETA_PRIVACY_VERSION,
    document: "docs/legal/NVET_CARTAGENA_BETA_PRIVACY_NOTICE.md",
  },
} as const;
