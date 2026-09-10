import { apiClient, dedupedGet } from './api'

export type VetRecruitmentStage = 'NEW' | 'CONTACTED' | 'INTERESTED' | 'INVITED' | 'LOST'

export type VetRecruitmentConversionStage =
  | 'LEAD_ONLY'
  | 'ACCOUNT_ROLE_MISMATCH'
  | 'ACCOUNT_EMAIL_UNVERIFIED'
  | 'ACCOUNT_REGISTERED'
  | 'SERVICE_AREA_REQUIRED'
  | 'DOCUMENT_REVIEW_REQUIRED'
  | 'REGISTRY_CHECK_REQUIRED'
  | 'VERIFICATION_APPROVAL_REQUIRED'
  | 'PROFILE_INACTIVE'
  | 'OPERATIONAL_READY'

export type VetActivationRisk =
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'BREACHED'
  | 'CRITICAL'
  | 'COMPLETE'
  | 'PAUSED'

export type VetActivationBlocker =
  | 'CONTACT_PERMISSION_REQUIRED'
  | 'INVITATION_REQUIRED'
  | 'INVITATION_DELIVERY_PENDING'
  | 'INVITATION_DELIVERY_FAILED'
  | 'INVITATION_REISSUE_REQUIRED'
  | 'INVITATION_CLAIM_REQUIRED'
  | 'ACCOUNT_LINK_REQUIRED'
  | 'ACCOUNT_ROLE_MISMATCH'
  | 'ACCOUNT_EMAIL_UNVERIFIED'
  | 'ACCOUNT_REGISTERED'
  | 'SERVICE_AREA_REQUIRED'
  | 'DOCUMENT_REVIEW_REQUIRED'
  | 'REGISTRY_CHECK_REQUIRED'
  | 'VERIFICATION_APPROVAL_REQUIRED'
  | 'PROFILE_INACTIVE'
  | 'DATA_CONFLICT'
  | 'LEAD_LOST'

export interface VetRecruitmentLead {
  leadId: string
  fullName: string
  email: string
  phone: string | null
  marketDaneCode: string
  source: string | null
  stage: VetRecruitmentStage
  nextFollowUpAt: string | null
  createdAt: string
  lastEventAt: string
  eventCount: number
  conflicted: boolean
  conflictReasons: string[]
  linkedUserId: string | null
  conversionStage: VetRecruitmentConversionStage
  nextAction: string
  followUpDue: boolean
  market: {
    code: string
    daneCode: string
    city: string
    department: string
  } | null
}

export interface VetRecruitmentMarket {
  code: string
  daneCode: string
  city: string
  department: string
  leads: number
  activeLeads: number
  new: number
  contacted: number
  interested: number
  invited: number
  lost: number
  registeredAccounts: number
  operationalReadyFromCrm: number
  totalOperationalSupply: number
  minimumOperationalVets: number
  coverageGap: number
  supplyReady: boolean
}

export interface VetRecruitmentSnapshot {
  phase: number
  program: string
  ledger: string
  appendOnly: boolean
  commercialLaunchAuthorized: boolean
  leadPresenceNeverCountsAsCoverage: boolean
  operationalSupplySource: string
  privacyBoundary: string
  totals: {
    leads: number
    activeLeads: number
    lostLeads: number
    registeredAccounts: number
    operationalReadyFromCrm: number
    dueFollowUps: number
  }
  markets: VetRecruitmentMarket[]
  leads: VetRecruitmentLead[]
  generatedAt: string
}

export interface VetActivationTelemetryLead {
  leadId: string
  fullName: string
  email: string
  marketDaneCode: string
  market: VetRecruitmentLead['market']
  outreachStage: VetRecruitmentStage
  conversionStage: VetRecruitmentConversionStage
  currentBlocker: VetActivationBlocker | null
  risk: VetActivationRisk
  blockerSince: string | null
  blockerAgeHours: number
  blockerSlaHours: number | null
  slaRemainingHours: number | null
  slaProgressRatio: number | null
  nextAction: string
  milestones: {
    leadCreatedAt: string
    permissionGrantedAt: string | null
    permissionRevokedAt: string | null
    invitationIssuedAt: string | null
    invitationProviderAcceptedAt: string | null
    invitationClaimedAt: string | null
    accountCreatedAt: string | null
    profileCreatedAt: string | null
    documentsApprovedAt: string | null
    registryVerifiedAt: string | null
    verificationApprovedAt: string | null
    operationalEvidenceAt: string | null
  }
  durationsHours: {
    leadToPermission: number | null
    permissionToInvitation: number | null
    invitationToClaim: number | null
    accountToProfile: number | null
    profileToDocumentsApproved: number | null
    documentsToRegistry: number | null
    registryToVerification: number | null
    leadToOperationalEvidence: number | null
  }
}

export interface VetActivationTelemetrySnapshot {
  phase: 23
  program: string
  measurementMode: 'read-only-observability'
  commercialLaunchAuthorized: false
  operationalSupplySource: string
  leadPresenceNeverCountsAsCoverage: true
  slaPolicy: {
    timezone: 'America/Bogota'
    configurableByEnvironment: true
    atRiskThresholdRatio: number
    hours: Partial<Record<VetActivationBlocker, number>>
  }
  totals: {
    leads: number
    operationalReady: number
    onTrack: number
    atRisk: number
    breached: number
    critical: number
    paused: number
    medianLeadToOperationalEvidenceHours: number | null
  }
  funnel: {
    leadCreated: number
    permissionEverGranted: number
    invitationProviderAccepted: number
    invitationClaimed: number
    accountLinked: number
    profileCreated: number
    documentsApproved: number
    registryVerified: number
    verificationApproved: number
    operationalReady: number
  }
  bottlenecks: Array<{
    blocker: VetActivationBlocker
    count: number
    breachedOrCritical: number
    oldestHours: number
  }>
  markets: Array<
    VetRecruitmentMarket & {
      onTrack: number
      atRisk: number
      breached: number
      critical: number
      medianLeadToOperationalEvidenceHours: number | null
    }
  >
  priorityQueue: VetActivationTelemetryLead[]
  leads: VetActivationTelemetryLead[]
  evidenceNotes: string[]
  generatedAt: string
}

export interface CreateVetRecruitmentLeadInput {
  fullName: string
  email: string
  phone?: string
  marketDaneCode: string
  source?: string
  nextFollowUpAt?: string
}

export const vetRecruitmentService = {
  getSnapshot(marketDaneCode?: string) {
    return dedupedGet<VetRecruitmentSnapshot>('/recruitment/vets', {
      ...(marketDaneCode ? { marketDaneCode } : {}),
    })
  },

  getActivationTelemetry(marketDaneCode?: string) {
    return dedupedGet<VetActivationTelemetrySnapshot>(
      '/recruitment/vets/activation-telemetry',
      {
        ...(marketDaneCode ? { marketDaneCode } : {}),
      },
    )
  },

  async createLead(input: CreateVetRecruitmentLeadInput) {
    const { data } = await apiClient.post<VetRecruitmentLead>('/recruitment/vets', input)
    return data
  },

  async updateStage(
    leadId: string,
    stage: VetRecruitmentStage,
    reason?: string,
  ) {
    const { data } = await apiClient.post<VetRecruitmentLead>(
      `/recruitment/vets/${leadId}/stage`,
      { stage, ...(reason ? { reason } : {}) },
    )
    return data
  },

  async scheduleFollowUp(leadId: string, nextFollowUpAt: string | null) {
    const { data } = await apiClient.post<VetRecruitmentLead>(
      `/recruitment/vets/${leadId}/follow-up`,
      { nextFollowUpAt },
    )
    return data
  },
}
