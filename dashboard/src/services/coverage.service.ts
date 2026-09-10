import { apiClient } from './api'

export type CoverageMarketStatus = 'ACTIVE' | 'PRELAUNCH'

export interface CoverageMarketReadiness {
  code: string
  daneCode: string
  city: string
  department: string
  countryCode: 'CO'
  metroGroup: string | null
  status: CoverageMarketStatus
  verifiedActiveVets: number
  geoReadyVets: number
  minimumGeoReadyVets: number
  coverageSatisfied: boolean
  launchEligible: boolean
  activeMarketOperationallyReady: boolean
}

export interface CoverageReadinessSnapshot {
  phase: number
  program: string
  country: 'CO'
  activationSource: string
  activationRequiresCodeDeploy: boolean
  bookingGeoEnforcement: boolean
  minimumGeoReadyVetsPerMarket: number
  activeMarketDaneCodes: string[]
  allActiveMarketsReady: boolean
  markets: CoverageMarketReadiness[]
  generatedAt: string
}

export const coverageService = {
  async getReadiness(): Promise<CoverageReadinessSnapshot> {
    const response = await apiClient.get<CoverageReadinessSnapshot>('/coverage/readiness')
    return response.data
  },
}

export default coverageService
