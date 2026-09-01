import api from './api'

export type NotificationCategory = 'APPOINTMENT' | 'PAYMENT' | 'PREVENTIVE' | string

export interface NotificationItem {
  id: string
  userId: string
  dedupeKey: string
  type: string
  category: NotificationCategory
  title: string
  message: string
  actionPath?: string | null
  metadata?: Record<string, unknown> | null
  occurredAt: string
  readAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface NotificationInbox {
  generatedAt: string
  summary: {
    total: number
    unread: number
  }
  items: NotificationItem[]
}

class NotificationService {
  async getInbox(limit = 50): Promise<NotificationInbox> {
    const { data } = await api.get<NotificationInbox>('/notifications', {
      params: { limit },
    })
    return data
  }

  async getUnreadCount(): Promise<number> {
    const { data } = await api.get<{ unread: number }>('/notifications/unread-count')
    return data.unread
  }

  async markRead(id: string): Promise<NotificationItem> {
    const { data } = await api.patch<NotificationItem>(`/notifications/${id}/read`)
    return data
  }

  async markAllRead(): Promise<{ updated: number; readAt: string }> {
    const { data } = await api.patch<{ updated: number; readAt: string }>(
      '/notifications/read-all',
    )
    return data
  }
}

export const notificationService = new NotificationService()
export default notificationService
