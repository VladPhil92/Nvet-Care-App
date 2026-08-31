import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MessageType, ReportReason, UserRole } from "@prisma/client";

interface PriceData {
  serviceName: string;
  priceCop: number;
  priceCtg?: number;
}

const ACTIVE_CHAT_STATUSES = new Set(["CONFIRMED", "IN_PROGRESS"]);

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
      throw new NotFoundException("Appointment not found");
    }

    const isClient = appointment.clientId === userId;
    const isVet = appointment.vet.userId === userId;

    if (!isClient && !isVet) {
      throw new ForbiddenException("You are not a participant in this chat");
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
      orderBy: { createdAt: "asc" },
    });
  }

  private async assertChatWritable(appointmentId: string): Promise<void> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true },
    });

    if (!appointment) {
      throw new NotFoundException("Appointment not found");
    }

    if (!ACTIVE_CHAT_STATUSES.has(String(appointment.status))) {
      throw new BadRequestException(
        "El chat solo admite nuevos mensajes cuando la cita está confirmada o en curso",
      );
    }
  }

  /**
   * Send a text message. Chat write access follows the appointment lifecycle:
   * only CONFIRMED and IN_PROGRESS appointments accept new content.
   */
  async sendMessage(appointmentId: string, senderId: string, content: string) {
    if (!content || content.trim().length === 0) {
      throw new BadRequestException("Message content cannot be empty");
    }

    await this.assertChatWritable(appointmentId);

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
    await this.assertChatWritable(appointmentId);

    const vet = await this.prisma.vetProfile.findUnique({
      where: { userId: senderId },
    });

    if (!vet) {
      throw new ForbiddenException("Only veterinarians can share prices");
    }

    const officialPrice = await this.prisma.price.findFirst({
      where: {
        vetId: vet.id,
        serviceName: priceData.serviceName,
        isActive: true,
      },
    });

    const isVerified = !!officialPrice;
    const content = `💰 ${priceData.serviceName}: ${priceData.priceCop.toLocaleString("es-CO")} COP${
      priceData.priceCtg ? ` (${priceData.priceCtg} CTG)` : ""
    }${isVerified ? " ✓ Precio oficial" : ""}`;

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
        pet: { select: { id: true, name: true } },
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
      throw new NotFoundException("Appointment not found");
    }

    const lastMessage = await this.prisma.message.findFirst({
      where: { appointmentId },
      orderBy: { createdAt: "desc" },
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
      appointment: {
        status: appointment.status,
        serviceType: appointment.serviceType,
        date: appointment.date,
        time: appointment.time,
        pet: appointment.pet,
        chatWritable: ACTIVE_CHAT_STATUSES.has(String(appointment.status)),
      },
      participants: [
        {
          ...appointment.vet.user,
          role: "VET",
        },
        {
          ...appointment.client,
          role: "CLIENT",
        },
      ],
      isMonitored: true,
      lastMessage,
      unreadCount,
    };
  }

  /**
   * Mark messages as read, constrained to the chat that was authorized by the
   * membership guard. Message IDs from another appointment are ignored.
   */
  async markAsRead(
    appointmentId: string,
    messageIds: string[],
    userId: string,
  ) {
    const result = await this.prisma.message.updateMany({
      where: {
        appointmentId,
        id: { in: messageIds },
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { message: "Messages marked as read", count: result.count };
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
      throw new NotFoundException("Message not found");
    }

    const reasonEnum = Object.values(ReportReason).includes(
      reason as ReportReason,
    )
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
      message: "Report submitted successfully",
    };
  }

  /**
   * Get active chats for user. The effective role is authoritative and this
   * endpoint fails closed outside CLIENT/VET instead of falling through to an
   * unscoped active-appointment query.
   */
  async getActiveChats(userId: string, actingRole?: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { vetProfile: true },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const effectiveRole = actingRole ?? user.role;
    const where: any = {
      status: { in: ["CONFIRMED", "IN_PROGRESS"] },
    };

    if (effectiveRole === UserRole.VET) {
      if (!user.vetProfile) return [];
      where.vetId = user.vetProfile.id;
    } else if (effectiveRole === UserRole.CLIENT) {
      where.clientId = userId;
    } else {
      throw new ForbiddenException(
        "Los chats activos solo están disponibles en modo cliente o veterinario",
      );
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      include: {
        pet: { select: { id: true, name: true } },
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
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ date: "asc" }, { time: "asc" }],
    });

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
          appointment: {
            status: apt.status,
            serviceType: apt.serviceType,
            date: apt.date,
            time: apt.time,
            pet: apt.pet,
            chatWritable: true,
          },
          participants: [
            { ...apt.vet.user, role: "VET" },
            { ...apt.client, role: "CLIENT" },
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
      throw new NotFoundException("Message not found");
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
      throw new BadRequestException(
        "Search query must be at least 2 characters",
      );
    }

    return this.prisma.message.findMany({
      where: {
        appointmentId,
        content: {
          contains: query.trim(),
          mode: "insensitive",
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
      orderBy: { createdAt: "desc" },
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
      orderBy: { createdAt: "desc" },
      take: limit + 1,
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
