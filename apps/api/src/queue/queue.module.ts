import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InboundModule } from '../inbound/inbound.module';
import { CampaignOrchestrateProcessor } from './campaign-orchestrate.processor';
import { ContactsImportProcessor } from './contacts-import.processor';
import { IncomingMessageProcessor } from './incoming-message.processor';
import { MessageSendProcessor } from './message-send.processor';
import {
  CAMPAIGN_ORCHESTRATE_QUEUE,
  CONTACTS_IMPORT_QUEUE,
  INCOMING_MESSAGES_QUEUE,
  MESSAGES_SEND_QUEUE,
} from './queue.constants';

@Module({
  imports: [
    forwardRef(() => InboundModule),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: MESSAGES_SEND_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    }),
    BullModule.registerQueue({
      name: CONTACTS_IMPORT_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 500,
        removeOnFail: false,
      },
    }),
    BullModule.registerQueue({
      name: CAMPAIGN_ORCHESTRATE_QUEUE,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: false,
      },
    }),
    BullModule.registerQueue({
      name: INCOMING_MESSAGES_QUEUE,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1500 },
        removeOnComplete: 2000,
        removeOnFail: false,
      },
    }),
  ],
  providers: [
    MessageSendProcessor,
    ContactsImportProcessor,
    CampaignOrchestrateProcessor,
    IncomingMessageProcessor,
  ],
  exports: [BullModule],
})
export class QueueModule {}
