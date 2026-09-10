import { apiClient, dedupedGet } from './api'

export type LaunchOperationsDecision = 'GO' | 'HOLD' | 'PAUSE'
export type ObservationState =
  | 'MISSING'
  | 'ACTIVE'
  | 'ELIGIBLE_TO_CLOSE'
  | 'CLOSED'
  | 'ABORTED'
  | 'CONFLICTED'
export type ExpiryState =
  | 'NON_EXPIRING'
  | 'HEALTHY'
  | 'ATTENTION'
  | 'WARNING'
  | 'CRITICAL'
  | 'EXPIRED'

export interface LaunchOperationsSnapshot {
  phase: 25
  program: string
  market: {
    code: string
    daneCode: string
    city: string
    department: string
  }
  decision: {
    phase24: LaunchOperationsDecision
    effective: LaunchOperationsDecision
    blockers: string[]
    operatorAction: string
    commercialLaunchAuthorized: false
    automaticallyMutatesRuntime: false
  }
  observation: {
    state: ObservationState
    observationId: string | null
    startedAt: string | null
    eligibleToCloseAt: string | null
    closedAt: string | null
    abortedAt: string | null
    incidentReference: string | null
    daysElapsed: number
    eventCount: number
    lastEventAt: string | null
    conflictReasons: string[]
    requiredWhenClosedBetaEnabled: true
    minimumObservationDays: number
    closureProvesElapsedWindowOnly: true
    uninterruptedRuntimeEvidenceMustBeReviewedSeparately: true
  }
  expiryWatch: {
    state: ExpiryState
    attentionWindowHours: number
    warningWindowHours: number
    criticalWindowHours: number
    earliestExpiryAt: string | null
    attentionCount: number
    warningCount: number
    criticalCount: number
    expiredCount: number
    readOnly: true
    items: Array<{
      id: string
      kind: 'AUTHORIZATION' | 'SUPPORT' | 'EVIDENCE'
      label: string
      expiresAt: string | null
      hoursRemaining: number | null
      state: ExpiryState
      sourceStatus: string
    }>
  }
  checklist: {
    items: Array<{
      id: string
      label: string
      satisfied: boolean
      blocking: boolean
    }>
    blockingSatisfied: boolean
    completed: number
    total: number
  }
  runtime: {
    closedBetaEnabled: boolean
    bookingEnabled: boolean
    authorizationActive: boolean
    authorizationExpiresAt: string | null
    marketGuardEnabled: boolean
    cartagenaBookingGateEligible: boolean
  }
  supply: {
    operationalReadyVets: number
    minimumRequiredVets: number
    coverageGap: number
    strictSupplySatisfied: boolean
    source: string
  }
  boundaries: {
    phase24Source: string
    observationLedger: 'audit_logs'
    observationLedgerAppendOnly: true
    observationActionsNeverToggleProviderFlags: true
    observationCloseNeverClaimsCommercialLaunch: true
    expiryWatchIsReadOnly: true
    noAutomaticEvidenceApproval: true
    noAutomaticBetaAuthorization: true
    commercialLaunchAuthorized: false
  }
  generatedAt: string
}

export const launchOperationsService = {
  getSnapshot() {
    return dedupedGet<LaunchOperationsSnapshot>('/beta/launch-operations')
  },
  async startObservation(reason: string) {
    const { data } = await apiClient.post<LaunchOperationsSnapshot>(
      '/beta/launch-operations/observation/start',
      { reason },
    )
    return data
  },
  async closeObservation(reason: string) {
    const { data } = await apiClient.post<LaunchOperationsSnapshot>(
      '/beta/launch-operations/observation/close',
      { reason },
    )
    return data
  },
  async abortObservation(reason: string, incidentReference: string) {
    const { data } = await apiClient.post<LaunchOperationsSnapshot>(
      '/beta/launch-operations/observation/abort',
      { reason, incidentReference },
    )
    return data
  },
}
