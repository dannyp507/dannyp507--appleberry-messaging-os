import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CommonModule } from '../common/common.module';
import { WhatsappAccountsController } from './whatsapp-accounts.controller';
import { WhatsappAccountsService } from './whatsapp-accounts.service';

@Module({
  imports: [CommonModule, BillingModule],
  controllers: [WhatsappAccountsController],
  providers: [WhatsappAccountsService],
})
export class WhatsappAccountsModule {}
