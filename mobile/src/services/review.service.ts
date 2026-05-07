import api from './api'

export interface Review {
  id: string
  appointmentId: string
  vetId: string
  clientId: string
  rating: number
  comment?: string | null
  createdAt: string
  client?: {
    id: string
    firstName: string
    lastName: string
    avatar?: string | null
  }
}

export interface VetReviewsResponse {
  vetId: string
  vetName: string
  averageRating: number
  totalReviews: number
  ratingDistribution: Record<number, number>
  results: Review[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface CreateReviewPayload {
  appointmentId: string
  rating: number
  comment?: string
}

export interface UpdateReviewPayload {
  rating?: number
  comment?: string
}

class ReviewService {
  /**
   * Obtiene las reviews de un veterinario (público, sin auth).
   */
  async getVetReviews(
    vetId: string,
    filters: { limit?: number; offset?: number; minRating?: number } = {},
  ): Promise<VetReviewsResponse> {
    const params = new URLSearchParams()
    if (filters.limit) params.append('limit', String(filters.limit))
    if (filters.offset) params.append('offset', String(filters.offset))
    if (filters.minRating) params.append('minRating', String(filters.minRating))

    const { data } = await api.get<VetReviewsResponse>(
      `/reviews/vets/${vetId}${params.toString() ? `?${params}` : ''}`,
    )
    return data
  }

  /**
   * Obtiene mis reviews como cliente.
   */
  async getMyReviews(filters: { limit?: number; offset?: number } = {}) {
    const { data } = await api.get('/reviews/me', { params: filters })
    return data
  }

  /**
   * Obtiene la review de una cita específica (null si no existe aún).
   */
  async getAppointmentReview(appointmentId: string): Promise<Review | null> {
    const { data } = await api.get<Review | null>(
      `/reviews/appointment/${appointmentId}`,
    )
    return data
  }

  /**
   * Crea una review para una cita completada.
   */
  async createReview(payload: CreateReviewPayload): Promise<Review> {
    const { data } = await api.post<Review>('/reviews', payload)
    return data
  }

  /**
   * Edita una review propia.
   */
  async updateReview(
    reviewId: string,
    payload: UpdateReviewPayload,
  ): Promise<Review> {
    const { data } = await api.patch<Review>(`/reviews/${reviewId}`, payload)
    return data
  }

  /**
   * Elimina una review propia.
   */
  async deleteReview(reviewId: string): Promise<void> {
    await api.delete(`/reviews/${reviewId}`)
  }
}

export const reviewService = new ReviewService()
export default reviewService
