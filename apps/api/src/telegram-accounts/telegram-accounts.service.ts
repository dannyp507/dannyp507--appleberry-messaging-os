import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTelegramAccountDto } from './dto/create-telegram-account.dto';

interface TelegramGetMeResult {
  ok: boolean;
  result?: { id: number; is_bot: boolean; username: string; first_name: string };
}

@Injectable()
export class TelegramAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getMe(botToken: string): Promise<TelegramGetMeResult['result']> {
    const url = `https://api.telegram.org/bot${botToken}/getMe`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new BadRequestException('Could not reach Telegram API');
    }
    const json = (await res.json()) as TelegramGetMeResult;
    if (!json.ok || !json.result) {
      throw new BadRequestException('Invalid bot token');
    }
    return json.result;
  }

  async create(workspaceId: string, dto: CreateTelegramAccountDto) {
    const me = await this.getMe(dto.botToken);
    return this.prisma.telegramAccount.create({
      data: {
        workspaceId,
        name: dto.name,
        botToken: dto.botToken,
        botUsername: me.username,
        botId: BigInt(me.id),
      },
    });
  }

  list(workspaceId: string) {
    return this.prisma.telegramAccount.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        botUsername: true,
        botId: true,
        isActive: true,
        webhookSet: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const account = await this.prisma.telegramAccount.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        name: true,
        botUsername: true,
        botId: true,
        isActive: true,
        webhookSet: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!account) throw new NotFoundException('Telegram account not found');
    return account;
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.prisma.telegramAccount.delete({ where: { id } });
    return { deleted: true };
  }

  async setWebhook(workspaceId: string, id: string, webhookUrl: string) {
    const account = await this.prisma.telegramAccount.findFirst({
      where: { id, workspaceId },
    });
    if (!account) throw new NotFoundException('Telegram account not found');

    const url = `https://api.telegram.org/bot${account.botToken}/setWebhook`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] }),
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) {
      throw new BadRequestException(json.description ?? 'Failed to set webhook');
    }

    await this.prisma.telegramAccount.update({
      where: { id },
      data: { webhookSet: true },
    });

    return { ok: true };
  }

  async sendMessage(botToken: string, chatId: string | number, text: string) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return res.json();
  }
}
