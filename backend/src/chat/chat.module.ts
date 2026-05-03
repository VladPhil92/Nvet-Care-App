import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { ChatMembershipGuard } from './guards/chat-membership.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, ChatMembershipGuard],
  exports: [ChatService, ChatMembershipGuard],
})
export class ChatModule {}
