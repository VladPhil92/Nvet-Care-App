import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import {
  WsJwtGuard,
  WsEmailVerifiedGuard,
} from '../auth/guards/ws-jwt.guard';
import { ChatService } from './chat.service';

interface AuthenticatedSocket extends Socket {
  user: {
    id: string;
    email: string;
    role: string;
    emailVerified: boolean;
    twoFactorEnabled: boolean;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*', // In production, specify exact origins
    credentials: true,
  },
})
@UseGuards(WsJwtGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  /**
   * Handle client connection
   */
  async handleConnection(client: AuthenticatedSocket) {
    console.log(`Client connected: ${client.id} - User: ${client.user?.id}`);
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: AuthenticatedSocket) {
    console.log(`Client disconnected: ${client.id}`);
    // Leave all rooms
    const rooms = Array.from(client.rooms);
    rooms.forEach((room) => {
      if (room !== client.id) {
        client.leave(room);
      }
    });
  }

  /**
   * Join appointment chat room
   */
  @SubscribeMessage('joinAppointment')
  async handleJoinAppointment(
    @MessageBody() appointmentId: string,
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      // Verify user is participant
      await this.chatService.verifyParticipant(appointmentId, client.user.id);
      
      // Join room
      client.join(appointmentId);
      console.log(`User ${client.user.id} joined appointment ${appointmentId}`);
      
      return { success: true, appointmentId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Leave appointment chat room
   */
  @SubscribeMessage('leaveAppointment')
  async handleLeaveAppointment(
    @MessageBody() appointmentId: string,
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.leave(appointmentId);
    console.log(`User ${client.user.id} left appointment ${appointmentId}`);
    return { success: true };
  }

  /**
   * Send message in real-time.
   * Requires email verification (anti-abuso de cuentas recién creadas).
   */
  @SubscribeMessage('message')
  @UseGuards(WsEmailVerifiedGuard)
  async handleMessage(
    @MessageBody() data: { appointmentId: string; content: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      // Verify participant
      await this.chatService.verifyParticipant(data.appointmentId, client.user.id);
      
      // Save message to database
      const message = await this.chatService.sendMessage(
        data.appointmentId,
        client.user.id,
        data.content,
      );

      // Broadcast to room (including sender)
      this.server.to(data.appointmentId).emit('message', message);

      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Share official price (vets only). Requires email verification para
   * mantener consistencia con el equivalente HTTP.
   */
  @SubscribeMessage('sharePrice')
  @UseGuards(WsEmailVerifiedGuard)
  async handleSharePrice(
    @MessageBody()
    data: {
      appointmentId: string;
      priceData: {
        serviceName: string;
        priceCop: number;
        priceCtg?: number;
      };
    },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      // Verify participant and role
      await this.chatService.verifyParticipant(data.appointmentId, client.user.id);

      if (client.user.role !== 'VET') {
        throw new Error('Only veterinarians can share prices');
      }

      // Save price message
      const message = await this.chatService.sharePrice(
        data.appointmentId,
        client.user.id,
        data.priceData,
      );

      // Broadcast to room
      this.server.to(data.appointmentId).emit('priceShared', message);

      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Typing indicator
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @MessageBody() data: { appointmentId: string; isTyping: boolean },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    try {
      // Verify participant
      await this.chatService.verifyParticipant(data.appointmentId, client.user.id);

      // Broadcast to others in room (not sender)
      client.to(data.appointmentId).emit('typing', {
        userId: client.user.id,
        isTyping: data.isTyping,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
