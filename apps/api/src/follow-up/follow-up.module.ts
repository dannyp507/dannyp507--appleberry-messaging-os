import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagesModule } from '../messages/messages.module';
import { FollowUpService } from './follow-up.service';

@Module({
  imports: [PrismaModule, MessagesModule],
  providers: [FollowUpService],
  exports: [FollowUpService],
})
export class FollowUpModule {}
