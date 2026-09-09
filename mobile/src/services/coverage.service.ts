import { apiClient } from './api'

export type CoverageMarketStatus = 'ACTIVE' | 'PRELAUNCH'

export interface CoverageMarket {
  code: string
  daneCode: string
  city: string
  department: string
  countryCode: 'CO'
  status: CoverageMarketStatus
}

export interface CoverageCatalog {
  country: 'CO'
  activationSource: string
  activationRequiresCodeDeploy: boolean
  bookingGeoEnforcement: boolean
  markets: CoverageMarket[]
}

export interface PointCoverage {
  country: 'CO'
  supported: boolean
  active: boolean
  status: 'ACTIVE' | 'PRELAUNCH' | 'UNSUPPORTED'
  market?: Omit<CoverageMarket, 'status'> & { metroGroup?: string | null }
  distanceToMarketCenterKm?: number
  message: string
}

class CoverageService {
  async getMarkets(): Promise<CoverageCatalog> {
    const response = await apiClient.get<CoverageCatalog>('/coverage/markets')
    return response.data
  }

  async checkPoint(latitude: number, longitude: number): Promise<PointCoverage> {
    const response = await apiClient.get<PointCoverage>('/coverage/check', {
      params: { latitude, longitude },
    })
    return response.data
  }
}

export const coverageService = new CoverageService()
export default coverageService
