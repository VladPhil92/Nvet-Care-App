import { apiClient } from './api'

export interface BetaPolicy {
  phase: number
  mode: 'closed-beta' | 'standard'
  market: string
  bookingEnabled: boolean
  cohortConfigured: boolean
}

export interface BetaLegalStatus {
  program: string
  effectiveAt: string
  terms: {
    version: string
    document: string
  }
  privacy: {
    version: string
    document: string
  }
  accepted: boolean
  acceptedAt: string | null
}

export interface AcceptBetaLegalInput {
  termsVersion: string
  privacyVersion: string
}

class BetaService {
  async getPolicy(): Promise<BetaPolicy> {
    const response = await apiClient.get<BetaPolicy>('/beta/policy')
    return response.data
  }

  async getLegalStatus(): Promise<BetaLegalStatus> {
    const response = await apiClient.get<BetaLegalStatus>('/beta/legal')
    return response.data
  }

  async acceptLegal(input: AcceptBetaLegalInput): Promise<BetaLegalStatus> {
    const response = await apiClient.post<BetaLegalStatus>('/beta/legal/accept', {
      accepted: true,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
    })
    return response.data
  }
}

export const betaService = new BetaService()
export default betaService
