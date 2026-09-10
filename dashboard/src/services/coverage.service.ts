import { apiClient } from './api'

export type CoverageMarketStatus = 'ACTIVE' | 'PRELAUNCH'
export type MarketPolicyState =
  | 'PRELAUNCH'
  | 'EXPANSION_LOCKED'
  | 'COVERAGE_BLOCKED'
  | 'BOOKING_GATE_ELIGIBLE'

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

export interface MarketLaunchPolicyMarket {
  code: string
  daneCode: string
  city: string
  department: string
  providerRequested: boolean
  expansionAllowed: boolean
  geoReadyVets: number
  minimumRequired: number
  coverageSatisfied: boolean
  bookingGateEligible: boolean
  state: MarketPolicyState
}

export interface MarketLaunchPolicySnapshot {
  phase: 15
  program: 'market-launch-guard'
  country: 'CO'
  guardEnabled: boolean
  nationalExpansionEnabled: boolean
  nationalExpansionSource: string
  marketActivationSource: string
  minimumGeoReadyVetsPerMarket: number
  cartagenaDaneCode: string
  cartagenaDoesNotRequireNationalExpansionFlag: boolean
  commercialLaunchAuthorized: false
  markets: MarketLaunchPolicyMarket[]
  generatedAt: string
}

export const coverageService = {
  async getReadiness(): Promise<CoverageReadinessSnapshot> {
    const response = await apiClient.get<CoverageReadinessSnapshot>('/coverage/readiness')
    return response.data
  },

  async getLaunchPolicy(): Promise<MarketLaunchPolicySnapshot> {
    const response = await apiClient.get<MarketLaunchPolicySnapshot>('/coverage/launch-policy')
    return response.data
  },
}

export default coverageService
