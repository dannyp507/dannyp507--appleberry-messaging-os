import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { WhatsappAccountsController } from './whatsapp-accounts.controller';
import { WhatsappAccountsService } from './whatsapp-accounts.service';

@Module({
  imports: [CommonModule],
  controllers: [WhatsappAccountsController],
  providers: [WhatsappAccountsService],
})
export class WhatsappAccountsModule {}
