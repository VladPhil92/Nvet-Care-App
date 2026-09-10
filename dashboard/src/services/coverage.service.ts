import { apiClient } from './api'

export type CoverageMarketStatus = 'ACTIVE' | 'PRELAUNCH'
export type MarketPolicyState =
  | 'PRELAUNCH'
  | 'EXPANSION_LOCKED'
  | 'COVERAGE_BLOCKED'
  | 'BOOKING_GATE_ELIGIBLE'
export type VetSupplyStage =
  | 'ACQUISITION_REQUIRED'
  | 'SERVICE_AREA_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'VERIFICATION_IN_PROGRESS'
  | 'COVERAGE_GAP'
  | 'SUPPLY_READY'

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
  geoMismatchedVets?: number
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
  serviceAreaConsistencyRequired?: boolean
  minimumGeoReadyVetsPerMarket: number
  activeMarketDaneCodes: string[]
  allActiveMarketsReady: boolean
  markets: CoverageMarketReadiness[]
  generatedAt: string
}

export interface CoveragePointResult {
  country: 'CO'
  supported: boolean
  active: boolean
  status: 'ACTIVE' | 'PRELAUNCH' | 'UNSUPPORTED'
  market?: {
    code: string
    daneCode: string
    city: string
    department: string
    countryCode: 'CO'
    metroGroup: string | null
  }
  distanceToMarketCenterKm?: number
  message: string
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
  phase: number
  program: 'market-launch-guard'
  country: 'CO'
  guardEnabled: boolean
  nationalExpansionEnabled: boolean
  nationalExpansionSource: string
  marketActivationSource: string
  minimumGeoReadyVetsPerMarket: number
  vetServiceAreaConsistencyRequired?: boolean
  cartagenaDaneCode: string
  cartagenaDoesNotRequireNationalExpansionFlag: boolean
  commercialLaunchAuthorized: false
  markets: MarketLaunchPolicyMarket[]
  generatedAt: string
}

export interface VetSupplyMarketFunnel {
  code: string
  daneCode: string
  city: string
  department: string
  metroGroup: string | null
  totalProfiles: number
  serviceAreaComplete: number
  geoConsistent: number
  verification: {
    none: number
    pending: number
    inReview: number
    approved: number
    rejected: number
    expired: number
  }
  approvedActive: number
  operationalGeoReady: number
  minimumOperationalVets: number
  coverageGap: number
  supplyReady: boolean
  stage: VetSupplyStage
  recommendedAction: string
  conversion: {
    serviceAreaPct: number
    geoConsistencyPct: number
    approvalPct: number
    operationalPct: number
  }
}

export interface VetSupplyFunnelSnapshot {
  phase: 17
  program: 'vet-supply-market-readiness'
  country: 'CO'
  minimumOperationalVetsPerMarket: number
  commercialLaunchAuthorized: false
  privacyBoundary: string
  totals: {
    totalProfiles: number
    serviceAreaComplete: number
    geoConsistent: number
    pendingReview: number
    approved: number
    operationalGeoReady: number
    supplyReadyMarkets: number
  }
  cartagena: {
    operationalGeoReady: number
    coverageGap: number
    supplyReady: boolean
    stage: VetSupplyStage
  } | null
  markets: VetSupplyMarketFunnel[]
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

  async getSupplyFunnel(): Promise<VetSupplyFunnelSnapshot> {
    const response = await apiClient.get<VetSupplyFunnelSnapshot>('/coverage/supply-funnel')
    return response.data
  },

  async checkPoint(latitude: number, longitude: number): Promise<CoveragePointResult> {
    const response = await apiClient.get<CoveragePointResult>('/coverage/check', {
      params: { latitude, longitude },
    })
    return response.data
  },
}

export default coverageService
