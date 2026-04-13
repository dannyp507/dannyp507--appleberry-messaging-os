import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { TelegramInboundService } from './telegram-inbound.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; last_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

@Controller('telegram/webhook')
export class TelegramWebhookController {
  constructor(private readonly inbound: TelegramInboundService) {}

  @Post(':accountId')
  handleWebhook(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body() update: TelegramUpdate,
  ) {
    void this.inbound.handleUpdate(accountId, update);
    return { ok: true };
  }
}
