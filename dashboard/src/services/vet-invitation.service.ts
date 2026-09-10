import { apiClient, dedupedGet } from './api'

export type VetInvitationStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'CLAIMED'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'SEND_FAILED'
  | 'CONFLICTED'

export interface VetInvitationRecord {
  invitationId: string
  leadId: string
  email: string
  fullName: string
  marketDaneCode: string
  marketCity: string | null
  status: VetInvitationStatus
  expiresAt: string
  issuedAt: string
  providerAcceptedAt: string | null
  claimedAt: string | null
  claimedUserId: string | null
  mailDriver: string | null
  providerMessageId: string | null
  tokenStored: false
}

export interface VetInvitationAdminSummary {
  phase: number
  program: string
  bearerTokensStored: boolean
  tokenStorage: string
  linkTransport: string
  productionMailFailClosed: boolean
  totals: {
    invitations: number
    active: number
    claimed: number
    expired: number
    failed: number
    conflicted: number
  }
  latestByLead: VetInvitationRecord[]
  generatedAt: string
}

export interface VetInvitationPreview {
  valid: boolean
  fullName?: string
  email?: string
  expiresAt?: string
  existingAccount?: boolean
  role?: 'VET'
  market?: {
    daneCode: string
    city: string
    department: string
  }
}

export const vetInvitationService = {
  getAdminSummary() {
    return dedupedGet<VetInvitationAdminSummary>(
      '/recruitment/vets/invitations/summary',
    )
  },

  async send(leadId: string, expiresInHours = 72, followUpInHours = 48) {
    const { data } = await apiClient.post<VetInvitationRecord>(
      `/recruitment/vets/${leadId}/invite`,
      { expiresInHours, followUpInHours },
    )
    return data
  },

  async preview(token: string) {
    const { data } = await apiClient.post<VetInvitationPreview>(
      '/recruitment/vet-invitations/preview',
      { token },
    )
    return data
  },

  async claim(token: string) {
    const { data } = await apiClient.post<{
      claimed: boolean
      leadId: string
      userId: string
      nextStep: 'VET_ONBOARDING'
    }>('/recruitment/vet-invitations/claim', { token })
    return data
  },
}
