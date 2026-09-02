import { apiClient } from './api'

export type ClientAiMode = 'CARE_GUIDANCE' | 'PRE_VISIT'
export type VetAiMode = 'CASE_REVIEW' | 'DOCUMENTATION'
export type ClientUrgency = 'routine' | 'soon' | 'urgent' | 'emergency'

export interface AiStatus {
  enabled: boolean
  model: string | null
  capabilities: {
    client: ClientAiMode[]
    vet: VetAiMode[]
  }
  safety: {
    clientDiagnosis: boolean
    autonomousPrescription: boolean
    emergencyRuleLayer: boolean
    providerStorageRequested: boolean
  }
}

export interface ClientAiGuidance {
  summary: string
  urgency: ClientUrgency
  redFlags: string[]
  recommendedActions: string[]
  questionsForVet: string[]
  appointmentRecommended: boolean
  selfCareBoundary: string
  disclaimer: string
}

export interface ClientAiAssistResponse {
  kind: 'CLIENT_CARE_GUIDANCE'
  generatedAt: string
  context: {
    petId: string
    sourceAppointments: number
  }
  result: ClientAiGuidance
  meta: {
    provider: string
    model: string | null
    safetyRuleTriggered: boolean
    contextVersion: string
  }
}

export interface VetAiCaseSupport {
  caseSummary: string
  problemList: string[]
  differentialConsiderations: string[]
  missingInformation: string[]
  redFlags: string[]
  suggestedNextSteps: string[]
  documentationDraft: {
    subjective: string
    objective: string
    assessmentSupport: string
    planSupport: string
  }
  confidence: 'low' | 'moderate' | 'high'
  disclaimer: string
}

export interface VetAiAssistResponse {
  kind: 'VET_CLINICAL_COPILOT'
  generatedAt: string
  context: {
    appointmentId: string
    petId: string
    priorCompletedAppointments: number
  }
  result: VetAiCaseSupport
  meta: {
    provider: string
    model: string | null
    contextVersion: string
  }
}

class AiService {
  async getStatus(): Promise<AiStatus> {
    const response = await apiClient.get<AiStatus>('/ai/status')
    return response.data
  }

  async clientAssist(input: {
    petId: string
    question: string
    mode: ClientAiMode
  }): Promise<ClientAiAssistResponse> {
    const response = await apiClient.post<ClientAiAssistResponse>(
      '/ai/client-assist',
      input,
    )
    return response.data
  }

  async vetAssist(input: {
    appointmentId: string
    question: string
    mode: VetAiMode
  }): Promise<VetAiAssistResponse> {
    const response = await apiClient.post<VetAiAssistResponse>('/ai/vet-assist', input)
    return response.data
  }
}

export const aiService = new AiService()
export default aiService
