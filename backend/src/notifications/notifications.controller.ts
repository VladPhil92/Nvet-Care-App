import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Request,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@Request() req, @Query("limit") limit?: string) {
    return this.notificationsService.listForUser(req.user.id, limit);
  }

  @Get("unread-count")
  async unreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Patch("read-all")
  async markAllRead(@Request() req) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Patch(":id/read")
  async markRead(
    @Request() req,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notificationsService.markRead(req.user.id, id);
  }
}
