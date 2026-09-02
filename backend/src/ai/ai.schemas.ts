export type ClientUrgency = "routine" | "soon" | "urgent" | "emergency";

export interface ClientAiGuidance {
  summary: string;
  urgency: ClientUrgency;
  redFlags: string[];
  recommendedActions: string[];
  questionsForVet: string[];
  appointmentRecommended: boolean;
  selfCareBoundary: string;
  disclaimer: string;
}

export interface VetAiCaseSupport {
  caseSummary: string;
  problemList: string[];
  differentialConsiderations: string[];
  missingInformation: string[];
  redFlags: string[];
  suggestedNextSteps: string[];
  documentationDraft: {
    subjective: string;
    objective: string;
    assessmentSupport: string;
    planSupport: string;
  };
  confidence: "low" | "moderate" | "high";
  disclaimer: string;
}

const stringArray = {
  type: "array",
  items: { type: "string" },
} as const;

export const CLIENT_GUIDANCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    urgency: {
      type: "string",
      enum: ["routine", "soon", "urgent", "emergency"],
    },
    redFlags: stringArray,
    recommendedActions: stringArray,
    questionsForVet: stringArray,
    appointmentRecommended: { type: "boolean" },
    selfCareBoundary: { type: "string" },
    disclaimer: { type: "string" },
  },
  required: [
    "summary",
    "urgency",
    "redFlags",
    "recommendedActions",
    "questionsForVet",
    "appointmentRecommended",
    "selfCareBoundary",
    "disclaimer",
  ],
} as const;

export const VET_CASE_SUPPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    caseSummary: { type: "string" },
    problemList: stringArray,
    differentialConsiderations: stringArray,
    missingInformation: stringArray,
    redFlags: stringArray,
    suggestedNextSteps: stringArray,
    documentationDraft: {
      type: "object",
      additionalProperties: false,
      properties: {
        subjective: { type: "string" },
        objective: { type: "string" },
        assessmentSupport: { type: "string" },
        planSupport: { type: "string" },
      },
      required: ["subjective", "objective", "assessmentSupport", "planSupport"],
    },
    confidence: {
      type: "string",
      enum: ["low", "moderate", "high"],
    },
    disclaimer: { type: "string" },
  },
  required: [
    "caseSummary",
    "problemList",
    "differentialConsiderations",
    "missingInformation",
    "redFlags",
    "suggestedNextSteps",
    "documentationDraft",
    "confidence",
    "disclaimer",
  ],
} as const;
