import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { INCOMING_MESSAGES_QUEUE } from '../queue/queue.constants';
import { WhatsAppCloudWebhookController } from './whatsapp-cloud-webhook.controller';
import { WhatsAppCloudInboundService } from './whatsapp-cloud-inbound.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: INCOMING_MESSAGES_QUEUE }),
  ],
  controllers: [WhatsAppCloudWebhookController],
  providers: [WhatsAppCloudInboundService],
})
export class WhatsAppCloudModule {}
