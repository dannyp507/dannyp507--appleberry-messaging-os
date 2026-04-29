import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { QueueModule } from '../queue/queue.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';

@Module({
  imports: [CommonModule, QueueModule, IntegrationsModule],
  controllers: [ContactsController],
  providers: [ContactsService],
})
export class ContactsModule {}
