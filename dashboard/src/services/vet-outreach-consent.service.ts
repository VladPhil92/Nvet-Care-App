import { apiClient, dedupedGet } from './api'

export type VetOutreachChannel = 'EMAIL'
export type VetOutreachConsentSource =
  | 'DIRECT_OPT_IN'
  | 'PARTNER_REFERRAL_WITH_PERMISSION'
  | 'EVENT_OR_CAMPAIGN_OPT_IN'
  | 'EXISTING_PROFESSIONAL_RELATIONSHIP'
  | 'OTHER_DOCUMENTED_PERMISSION'
export type VetOutreachConsentState =
  | 'NOT_RECORDED'
  | 'ACTIVE'
  | 'REVOKED'
  | 'CONFLICTED'

export interface VetOutreachConsentStatus {
  phase: 22
  leadId: string
  state: VetOutreachConsentState
  contactAllowed: boolean
  channel: VetOutreachChannel | null
  source: VetOutreachConsentSource | null
  evidenceReference: string | null
  authorizationStatementVersion: string | null
  grantedAt: string | null
  revokedAt: string | null
  conflicted: boolean
}

export interface VetOutreachConsentSummary {
  phase: 22
  program: string
  ledger: 'audit_logs'
  appendOnly: true
  evidenceStorage: 'reference-only'
  supportedChannels: VetOutreachChannel[]
  productionInvitationConsentGate: true
  totals: {
    recorded: number
    active: number
    revoked: number
    conflicted: number
  }
  permissions: VetOutreachConsentStatus[]
  generatedAt: string
}

export interface GrantVetOutreachConsentInput {
  channel: 'EMAIL'
  source: VetOutreachConsentSource
  evidenceReference: string
  authorizationStatementVersion: string
  note?: string
}

export const vetOutreachConsentService = {
  getAdminSummary() {
    return dedupedGet<VetOutreachConsentSummary>(
      '/recruitment/vets/contact-permissions/summary',
    )
  },

  getStatus(leadId: string) {
    return dedupedGet<VetOutreachConsentStatus>(
      `/recruitment/vets/${leadId}/contact-permission`,
    )
  },

  async grant(leadId: string, input: GrantVetOutreachConsentInput) {
    const { data } = await apiClient.post<VetOutreachConsentStatus>(
      `/recruitment/vets/${leadId}/contact-permission`,
      input,
    )
    return data
  },

  async revoke(leadId: string, reason?: string) {
    const { data } = await apiClient.post<VetOutreachConsentStatus>(
      `/recruitment/vets/${leadId}/contact-permission/revoke`,
      { reason },
    )
    return data
  },
}
