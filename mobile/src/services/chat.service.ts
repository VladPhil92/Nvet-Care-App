import api from './api';

interface Message {
  id: string;
  appointmentId: string;
  senderId: string;
  content: string;
  type: 'TEXT' | 'PRICE' | 'SYSTEM';
  priceData?: {
    serviceName: string;
    priceCop: number;
    priceCtg?: number;
    isVerified: boolean;
  };
  createdAt: string;
  sender?: {
    id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: 'VET' | 'CLIENT';
  };
}

interface ChatMetadata {
  appointmentId: string;
  participants: Array<{
    id: string;
    firstName: string;
    lastName: string;
    role: 'VET' | 'CLIENT';
    avatar?: string;
  }>;
  isMonitored: boolean;
  lastMessage?: Message;
  unreadCount: number;
}

const chatService = {
  /**
   * Get all messages for a specific appointment
   */
  async getMessages(appointmentId: string): Promise<Message[]> {
    const response = await api.get(`/chat/${appointmentId}/messages`);
    return response.data;
  },

  /**
   * Send a text message
   */
  async sendMessage(appointmentId: string, content: string): Promise<Message> {
    const response = await api.post(`/chat/${appointmentId}/messages`, {
      content,
      type: 'TEXT',
    });
    return response.data;
  },

  /**
   * Share official price list (only for vets)
   */
  async sharePrice(
    appointmentId: string,
    priceData: {
      serviceName: string;
      priceCop: number;
      priceCtg?: number;
    }
  ): Promise<Message> {
    const response = await api.post(`/chat/${appointmentId}/share-price`, {
      priceData,
    });
    return response.data;
  },

  /**
   * Get chat metadata (participants, monitoring status, unread count)
   */
  async getChatMetadata(appointmentId: string): Promise<ChatMetadata> {
    const response = await api.get(`/chat/${appointmentId}/metadata`);
    return response.data;
  },

  /**
   * Mark messages as read
   */
  async markAsRead(appointmentId: string, messageIds: string[]): Promise<void> {
    await api.post(`/chat/${appointmentId}/mark-read`, {
      messageIds,
    });
  },

  /**
   * Report a message (abusive pricing, inappropriate content, etc.)
   */
  async reportMessage(
    messageId: string,
    reason: 'ABUSIVE_PRICING' | 'INAPPROPRIATE' | 'SPAM' | 'OTHER',
    details?: string
  ): Promise<void> {
    await api.post(`/chat/messages/${messageId}/report`, {
      reason,
      details,
    });
  },

  /**
   * Get all active chats for current user
   */
  async getActiveChats(): Promise<ChatMetadata[]> {
    const response = await api.get('/chat/active');
    return response.data;
  },

  /**
   * Delete a message (only sender can delete within 5 minutes)
   */
  async deleteMessage(messageId: string): Promise<void> {
    await api.delete(`/chat/messages/${messageId}`);
  },

  /**
   * Search messages in a chat
   */
  async searchMessages(
    appointmentId: string,
    query: string
  ): Promise<Message[]> {
    const response = await api.get(`/chat/${appointmentId}/search`, {
      params: { q: query },
    });
    return response.data;
  },

  /**
   * Get chat history pagination
   */
  async getMessagesPage(
    appointmentId: string,
    options?: {
      before?: string; // messageId
      after?: string; // messageId
      limit?: number;
    }
  ): Promise<{
    messages: Message[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    const response = await api.get(`/chat/${appointmentId}/messages/page`, {
      params: options,
    });
    return response.data;
  },
};

export default chatService;
