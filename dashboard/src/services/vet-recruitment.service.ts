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
