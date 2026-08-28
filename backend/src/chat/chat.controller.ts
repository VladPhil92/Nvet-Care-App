import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from "@nestjs/common";
import { ChatService } from "./chat.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { EmailVerifiedGuard } from "../auth/guards/email-verified.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@prisma/client";
import { SendMessageDto } from "./dto/send-message.dto";
import { SharePriceDto } from "./dto/share-price.dto";
import { ReportMessageDto } from "./dto/report-message.dto";
import { ChatMembershipGuard } from "./guards/chat-membership.guard";

/**
 * ChatController — endpoints HTTP del chat arbitrado.
 *
 * Todos los endpoints heredan `JwtAuthGuard` a nivel de clase. Las rutas
 * con `:appointmentId` agregan `ChatMembershipGuard` que valida que el
 * usuario es el cliente o el vet de la cita (cacheando el appointment
 * en `req.appointment` para evitar re-query en el handler).
 *
 * Endpoints de envío (POST messages, share-price) además requieren
 * `EmailVerifiedGuard` para mitigar abuso de cuentas recién creadas.
 */
@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * GET /chat/active
   * Get all active chats for current user. NO requiere membership guard
   * porque solo lista las propias del usuario autenticado.
   * Importante: declarar ANTES de :appointmentId para evitar match conflict.
   */
  @Get("active")
  async getActiveChats(@Request() req) {
    return this.chatService.getActiveChats(req.user.id);
  }

  /**
   * GET /chat/:appointmentId/messages
   * Get all messages for an appointment
   */
  @Get(":appointmentId/messages")
  @UseGuards(ChatMembershipGuard)
  async getMessages(@Param("appointmentId") appointmentId: string) {
    return this.chatService.getMessages(appointmentId);
  }

  /**
   * POST /chat/:appointmentId/messages
   * Send a text message. Requires email verified to prevent spam from
   * unverified accounts.
   */
  @Post(":appointmentId/messages")
  @UseGuards(EmailVerifiedGuard, ChatMembershipGuard)
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Param("appointmentId") appointmentId: string,
    @Body() sendMessageDto: SendMessageDto,
    @Request() req,
  ) {
    return this.chatService.sendMessage(
      appointmentId,
      req.user.id,
      sendMessageDto.content,
    );
  }

  /**
   * POST /chat/:appointmentId/share-price
   * Share official price (vets only)
   */
  @Post(":appointmentId/share-price")
  @UseGuards(EmailVerifiedGuard, ChatMembershipGuard, RolesGuard)
  @Roles(UserRole.VET)
  @HttpCode(HttpStatus.CREATED)
  async sharePrice(
    @Param("appointmentId") appointmentId: string,
    @Body() sharePriceDto: SharePriceDto,
    @Request() req,
  ) {
    return this.chatService.sharePrice(
      appointmentId,
      req.user.id,
      sharePriceDto.priceData,
    );
  }

  /**
   * GET /chat/:appointmentId/metadata
   * Get chat metadata (participants, monitoring status, unread count)
   */
  @Get(":appointmentId/metadata")
  @UseGuards(ChatMembershipGuard)
  async getChatMetadata(
    @Param("appointmentId") appointmentId: string,
    @Request() req,
  ) {
    return this.chatService.getChatMetadata(appointmentId, req.user.id);
  }

  /**
   * POST /chat/:appointmentId/mark-read
   * Mark messages as read
   */
  @Post(":appointmentId/mark-read")
  @UseGuards(ChatMembershipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAsRead(@Body("messageIds") messageIds: string[], @Request() req) {
    await this.chatService.markAsRead(messageIds, req.user.id);
    return;
  }

  /**
   * POST /chat/messages/:messageId/report
   * Report a message. ChatMembershipGuard resuelve el appointmentId desde
   * el messageId, garantizando que solo participantes pueden reportar.
   */
  @Post("messages/:messageId/report")
  @UseGuards(ChatMembershipGuard)
  @HttpCode(HttpStatus.CREATED)
  async reportMessage(
    @Param("messageId") messageId: string,
    @Body() reportMessageDto: ReportMessageDto,
    @Request() req,
  ) {
    return this.chatService.reportMessage(
      messageId,
      req.user.id,
      reportMessageDto.reason,
      reportMessageDto.details,
    );
  }

  /**
   * DELETE /chat/messages/:messageId
   * Delete a message (5 min window). El sender ya implica membership,
   * pero igual aplicamos el guard para defensa en profundidad.
   */
  @Delete("messages/:messageId")
  @UseGuards(ChatMembershipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(@Param("messageId") messageId: string, @Request() req) {
    const message = await this.chatService.getMessageById(messageId);

    // Only sender can delete
    if (message.senderId !== req.user.id) {
      throw new ForbiddenException("You can only delete your own messages");
    }

    // Check 5 minute window
    const now = new Date();
    const createdAt = new Date(message.createdAt);
    const minutesElapsed = (now.getTime() - createdAt.getTime()) / 1000 / 60;

    if (minutesElapsed > 5) {
      throw new ForbiddenException(
        "Messages can only be deleted within 5 minutes",
      );
    }

    await this.chatService.deleteMessage(messageId);
    return;
  }

  /**
   * GET /chat/:appointmentId/search
   * Search messages in a chat
   */
  @Get(":appointmentId/search")
  @UseGuards(ChatMembershipGuard)
  async searchMessages(
    @Param("appointmentId") appointmentId: string,
    @Query("q") query: string,
  ) {
    return this.chatService.searchMessages(appointmentId, query);
  }

  /**
   * GET /chat/:appointmentId/messages/page
   * Get messages with pagination
   */
  @Get(":appointmentId/messages/page")
  @UseGuards(ChatMembershipGuard)
  async getMessagesPage(
    @Param("appointmentId") appointmentId: string,
    @Query("before") before?: string,
    @Query("after") after?: string,
    @Query("limit") limit?: number,
  ) {
    return this.chatService.getMessagesPage(appointmentId, {
      before,
      after,
      limit: limit || 50,
    });
  }
}
