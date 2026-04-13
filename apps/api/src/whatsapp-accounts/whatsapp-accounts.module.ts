import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { WhatsappAccountsController } from './whatsapp-accounts.controller';
import { WhatsappAccountsService } from './whatsapp-accounts.service';
import { BaileysModule } from '../baileys/baileys.module';

@Module({
  imports: [CommonModule, BaileysModule],
  controllers: [WhatsappAccountsController],
  providers: [WhatsappAccountsService],
  exports: [WhatsappAccountsService],
})
export class WhatsappAccountsModule {}
