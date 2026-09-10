import { apiClient } from './api'

export type RegistryCheckStatus = 'VERIFIED' | 'NOT_FOUND' | 'SANCTIONED' | 'UNAVAILABLE'

export const vetVerificationAdminService = {
  async approveDocument(documentId: string, notes?: string): Promise<void> {
    await apiClient.post(`/vets/admin/documents/${documentId}/approve`, { notes })
  },

  async rejectDocument(documentId: string, reason: string): Promise<void> {
    await apiClient.post(`/vets/admin/documents/${documentId}/reject`, { reason })
  },

  async recordRegistryCheck(
    vetProfileId: string,
    status: RegistryCheckStatus,
    evidence: string,
  ): Promise<void> {
    await apiClient.post(`/vets/registry/admin/${vetProfileId}/check`, {
      status,
      evidence,
    })
  },

  async downloadDocument(documentId: string, fileName: string): Promise<void> {
    const response = await apiClient.get<Blob>(`/vets/admin/documents/${documentId}/file`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    try {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName || 'verification-document'
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } finally {
      URL.revokeObjectURL(url)
    }
  },
}

export default vetVerificationAdminService
