import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { MessagesModule } from '../messages/messages.module';
import { QueueModule } from '../queue/queue.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [CommonModule, MessagesModule, QueueModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
