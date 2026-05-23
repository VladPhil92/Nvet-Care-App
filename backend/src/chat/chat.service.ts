import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessageType, ReportReason } from '@prisma/client';

interface PriceData {
  serviceName: string;
  priceCop: number;
  priceCtg?: number;
}

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  /**
   * Verify user is a participant in the appointment
   */
  async verifyParticipant(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        vet: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const isClient = appointment.clientId === userId;
    const isVet = appointment.vet.userId === userId;

    if (!isClient && !isVet) {
      throw new ForbiddenException('You are not a participant in this chat');
    }

    return appointment;
  }

  /**
   * Get all messages for an appointment
   */
  async getMessages(appointmentId: string) {
    return this.prisma.message.findMany({
      where: { appointmentId },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Send a text message
   */
  async sendMessage(appointmentId: string, senderId: string, content: string) {
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('Message content cannot be empty');
    }

    return this.prisma.message.create({
      data: {
        appointmentId,
        senderId,
        content: content.trim(),
        type: MessageType.TEXT,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Share official price (vets only)
   */
  async sharePrice(
    appointmentId: string,
    senderId: string,
    priceData: PriceData,
  ) {
    // Verify sender is vet
    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId: senderId },
    });

    if (!vet) {
      throw new ForbiddenException('Only veterinarians can share prices');
    }

    // Check if this is an official price from vet's price list
    const officialPrice = await this.prisma.price.findFirst({
      where: {
        vetId: vet.id,
        serviceName: priceData.serviceName,
        isActive: true,
      },
    });

    const isVerified = !!officialPrice;

    // Build content string
    const content = `💰 ${priceData.serviceName}: ${priceData.priceCop.toLocaleString('es-CO')} COP${
      priceData.priceCtg ? ` (${priceData.priceCtg} CTG)` : ''
    }${isVerified ? ' ✓ Precio oficial' : ''}`;

    return this.prisma.message.create({
      data: {
        appointmentId,
        senderId,
        content,
        type: MessageType.PRICE_OFFER,
        priceData: {
          ...priceData,
          isVerified,
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Get chat metadata
   */
  async getChatMetadata(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        vet: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                role: true,
              },
            },
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Get last message
    const lastMessage = await this.prisma.message.findFirst({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    const unreadCount = await this.prisma.message.count({
      where: {
        appointmentId,
        senderId: { not: userId },
        readAt: null,
      },
    });

    return {
      appointmentId,
      participants: [
        {
          ...appointment.vet.user,
          role: 'VET',
        },
        {
          ...appointment.client,
          role: 'CLIENT',
        },
      ],
      isMonitored: true, // All chats are monitored for arbitration
      lastMessage,
      unreadCount,
    };
  }

  /**
   * Mark messages as read (sets readAt timestamp on unread messages not sent by user)
   */
  async markAsRead(messageIds: string[], userId: string) {
    const result = await this.prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { message: 'Messages marked as read', count: result.count };
  }

  /**
   * Report a message — persists to MessageReport table for admin review
   */
  async reportMessage(
    messageId: string,
    reporterId: string,
    reason: string,
    details?: string,
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Map string reason to enum; default to OTHER if unrecognised
    const reasonEnum = Object.values(ReportReason).includes(reason as ReportReason)
      ? (reason as ReportReason)
      : ReportReason.OTHER;

    await this.prisma.messageReport.create({
      data: {
        messageId,
        reporterId,
        reason: reasonEnum,
        details,
      },
    });

    return {
      success: true,
      message: 'Report submitted successfully',
    };
  }

  /**
   * Get active chats for user
   */
  async getActiveChats(userId: string) {
    // Get user's role
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get appointments where user is participant and status is active
    const where: any = {
      status: { in: ['CONFIRMED', 'IN_PROGRESS'] },
    };

    if (user.role === 'VET' && user.vetProfile) {
      where.vetId = user.vetProfile.id;
    } else if (user.role === 'CLIENT') {
      where.clientId = userId;
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      include: {
        vet: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Build chat metadata for each appointment
    return Promise.all(
      appointments.map(async (apt) => {
        const unreadCount = await this.prisma.message.count({
          where: {
            appointmentId: apt.id,
            senderId: { not: userId },
            readAt: null,
          },
        });

        return {
          appointmentId: apt.id,
          participants: [
            { ...apt.vet.user, role: 'VET' },
            { ...apt.client, role: 'CLIENT' },
          ],
          isMonitored: true,
          lastMessage: apt.messages[0] || null,
          unreadCount,
        };
      }),
    );
  }

  /**
   * Get message by ID
   */
  async getMessageById(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return message;
  }

  /**
   * Delete a message
   */
  async deleteMessage(messageId: string) {
    await this.prisma.message.delete({
      where: { id: messageId },
    });

    return { success: true };
  }

  /**
   * Search messages in a chat
   */
  async searchMessages(appointmentId: string, query: string) {
    if (!query || query.trim().length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }

    return this.prisma.message.findMany({
      where: {
        appointmentId,
        content: {
          contains: query.trim(),
          mode: 'insensitive',
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get messages with pagination
   */
  async getMessagesPage(
    appointmentId: string,
    options: {
      before?: string;
      after?: string;
      limit?: number;
    },
  ) {
    const limit = options.limit || 50;
    const where: any = { appointmentId };

    // Cursor-based pagination
    let cursor: any = undefined;
    if (options.before) {
      cursor = { id: options.before };
    } else if (options.after) {
      cursor = { id: options.after };
    }

    const messages = await this.prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to check hasMore
      ...(cursor && { cursor, skip: 1 }),
    });

    const hasMore = messages.length > limit;
    const results = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: results,
      hasMore,
      nextCursor: hasMore ? results[results.length - 1].id : undefined,
    };
  }
}
