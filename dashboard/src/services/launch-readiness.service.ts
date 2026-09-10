import { dedupedGet } from './api'

export type LaunchDecision = 'GO' | 'HOLD' | 'PAUSE'
export type LaunchGateStatus = 'PENDING' | 'VERIFIED' | 'CONFLICTED'
export type LaunchGateCategory =
  | 'RELEASE'
  | 'INFRASTRUCTURE'
  | 'FINANCIAL'
  | 'SUPPLY'
  | 'OPERATIONS'
  | 'LEGAL'

export interface LaunchEvidenceGate {
  gate: string
  status: LaunchGateStatus
  category: LaunchGateCategory
  blocking: true
  approvedEvidenceCount: number
  stagingApprovedEvidenceCount: number
  conflictCount: number
  expiredCount: number
}

export interface LaunchReadinessSnapshot {
  phase: 24
  program: string
  market: {
    code: string
    daneCode: string
    city: string
    department: string
  }
  decision: {
    state: LaunchDecision
    scope: 'CLOSED_BETA_CARTAGENA'
    prerequisitesSatisfied: boolean
    pausedByKillSwitch: boolean
    recommendedAction: string
    blockers: string[]
    warnings: string[]
    commercialLaunchAuthorized: false
    decisionAuthorizesCommercialLaunch: false
  }
  progress: {
    evidenceCompletionPercentage: number
    operationalSupplyPercentage: number
    verifiedEvidenceGates: number
    totalEvidenceGates: number
  }
  runtime: {
    closedBetaEnabled: boolean
    bookingEnabled: boolean
    betaActivationState: string
    authorizationActive: boolean
    authorizationExpiresAt: string | null
    marketGuardEnabled: boolean
    cartagenaBookingGateEligible: boolean
    cartagenaProviderRequested: boolean
  }
  categories: Array<{
    category: LaunchGateCategory
    total: number
    verified: number
    pending: number
    conflicted: number
    ready: boolean
    gates: LaunchEvidenceGate[]
  }>
  supply: {
    operationalReadyVets: number
    minimumRequiredVets: number
    coverageGap: number
    strictSupplySatisfied: boolean
    source: string
  }
  recruitmentResilience: {
    measurementMode: 'read-only-observability'
    leads: number
    operationalReadyFromRecruitment: number
    onTrack: number
    atRisk: number
    breached: number
    critical: number
    paused: number
    medianLeadToOperationalEvidenceHours: number | null
    bottlenecks: Array<{
      blocker: string
      count: number
      breachedOrCritical: number
      oldestHours: number
    }>
    blockingForLaunchDecision: false
    note: string
  }
  boundaries: {
    sourceEvidenceGates: readonly string[]
    strictSupplySource: string
    activationTelemetrySource: string
    providerPolicySource: string
    betaReadinessSource: string
    noAutomaticEvidenceApproval: true
    noProviderConfigurationMutation: true
    noCommercialLaunchAuthorization: true
  }
  generatedAt: string
}

export const launchReadinessService = {
  getCartagenaSnapshot() {
    return dedupedGet<LaunchReadinessSnapshot>('/beta/launch-readiness')
  },
}
