import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { CommonModule } from '../common/common.module';
import { MessagesModule } from '../messages/messages.module';
import { QueueModule } from '../queue/queue.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [CommonModule, MessagesModule, QueueModule, ChannelsModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
