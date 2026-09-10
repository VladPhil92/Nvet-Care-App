import { dedupedGet } from './api'

export type SloMetricState = 'PASS' | 'WATCH' | 'BREACHED' | 'INSUFFICIENT_DATA'
export type OverallSloState = 'HEALTHY' | 'WATCH' | 'BREACHED' | 'INSUFFICIENT_DATA'

type LatencySummary = {
  sampleSize: number
  medianMinutes: number | null
  p95Minutes: number | null
  maxMinutes: number | null
}

type CensoredLatencySummary = LatencySummary & {
  censoredSampleSize: number
  exactSampleSize: number
  overdueWithoutEvent: number
}

export interface ServiceQualitySnapshot {
  phase: 26
  program: string
  market: {
    code: string
    daneCode: string
    city: string
    department: string
  }
  window: {
    hours: number
    from: string
    to: string
    basis: string
    maxRows: number
  }
  appointments: {
    total: number
    statusCounts: Record<string, number>
    confirmedEver: number
    completedEver: number
    cancelledBeforeCompletion: number
    terminalOutcomeCount: number
    outcomeEvaluableCount: number
    matureOutcomeCount: number
    immatureOutcomeCount: number
    confirmationRatePct: number | null
    completionRatePct: number | null
    cancellationRatePct: number | null
    disputeRatePct: number | null
    outcomeRatesExcludeImmatureAppointments: true
    maturityGraceMinutes: number
  }
  latency: {
    vetResponseMinutes: LatencySummary
    vetResponseSloMinutes: CensoredLatencySummary
    bookingConfirmationMinutes: LatencySummary
    serviceStartDelayMinutes: CensoredLatencySummary
    confirmedToStartMinutes: LatencySummary
    serviceDurationMinutes: LatencySummary
    semantics: {
      vetResponse: string
      vetResponseMeasured: false
      bookingConfirmation: string
      bookingConfirmationMayBeFinanciallyTriggered: true
      serviceStartDelay: string
      confirmedToStart: string
      serviceDuration: string
      assignmentLatencyMeasured: false
      survivorBiasControlled: true
      reason: string
    }
  }
  payments: {
    transactions: number
    resolvedTransactions: number
    unresolvedTransactions: number
    transactionCoverageRatePct: number | null
    statusCounts: Record<string, number>
    methodCounts: Record<string, number>
    verifiedEver: number
    liquidatedEver: number
    failureRatePct: number | null
    disputeRatePct: number | null
    failureRateExcludesPendingAndVerifying: true
    verificationLatencyMinutes: LatencySummary
    settlementLatencyMinutes: LatencySummary
  }
  dataQuality: {
    appointmentsWithIssues: number
    issueRatePct: number | null
    unresolvedMarketAppointmentsInWindow: number
    categories: Record<string, number>
    measurementIntegrity: {
      historicalTransitionsAreDerivedOnlyFromPersistedTimestamps: true
      cancellationTimestampMayBeLegacyIncomplete: true
      matureUnconfirmedResponseUsesElapsedLowerBound: false
      missingConfirmationTimestampIsCoverageGapNotVetResponseFailure: true
      matureMissingStartUsesElapsedLowerBound: true
      noSyntheticTimestamps: true
    }
  }
  slo: {
    overall: OverallSloState
    minimumSampleSize: number
    targets: Record<string, number>
    metrics: Array<{
      id: string
      label: string
      state: SloMetricState
      value: number | null
      target: number
      comparator: 'LTE' | 'GTE'
      unit: 'minutes' | 'percent'
      sampleSize: number
    }>
    policySource: string
    targetsAreCustomerPromises: false
    automaticallyChangesLaunchDecision: false
    insufficientMetricMakesOverallInsufficient: true
  }
  observationContext: {
    phase25Decision: 'GO' | 'HOLD' | 'PAUSE'
    observationState: string
    daysElapsed: number
    closedBetaEnabled: boolean
  } | null
  operatorAction: string
  boundaries: {
    readOnly: true
    aggregateOnly: true
    exposesUserIdentifiers: false
    exposesAddresses: false
    exposesCoordinates: false
    mutatesProviderConfiguration: false
    approvesEvidence: false
    commercialLaunchAuthorized: false
  }
  generatedAt: string
}

export const serviceQualityService = {
  getSnapshot(windowHours = 168, marketDaneCode = '13001') {
    const params = new URLSearchParams({
      windowHours: String(windowHours),
      marketDaneCode,
    })
    return dedupedGet<ServiceQualitySnapshot>(
      `/operations/service-quality?${params.toString()}`,
    )
  },
}
