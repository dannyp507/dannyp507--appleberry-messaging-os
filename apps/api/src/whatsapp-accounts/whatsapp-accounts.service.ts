import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WhatsAppProviderType } from '@prisma/client';
import { BaileysSessionManager } from '../providers/whatsapp/baileys-session.manager';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import type { CreateWhatsAppAccountDto } from './dto/create-whatsapp-account.dto';

@Injectable()
export class WhatsappAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly baileys: BaileysSessionManager,
  ) {}

  list(workspaceId: string) {
    return this.prisma.whatsAppAccount.findMany({
      where: { workspaceId, isArchived: false },
      include: { session: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(workspaceId: string, dto: CreateWhatsAppAccountDto) {
    await this.billing.assertCanCreateWhatsAppAccount(workspaceId);

    if (dto.providerType === WhatsAppProviderType.BAILEYS) {
      await this.billing.assertHasBaileysProvider(workspaceId);
    }

    return this.prisma.whatsAppAccount.create({
      data: {
        workspaceId,
        name: dto.name,
        phone: dto.phone,
        providerType: dto.providerType ?? 'MOCK',
      },
    });
  }

  async connectBaileys(workspaceId: string, accountId: string) {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id: accountId, workspaceId, isArchived: false },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.providerType !== WhatsAppProviderType.BAILEYS) {
      throw new BadRequestException('Account is not a BAILEYS account');
    }

    await this.billing.assertHasBaileysProvider(workspaceId);

    // Fire and forget — QR will appear in the session record shortly
    void this.baileys.startSession(accountId);
    return { started: true };
  }

  async getSession(workspaceId: string, accountId: string) {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id: accountId, workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');

    return this.baileys.getSessionInfo(accountId);
  }

  async disconnectBaileys(workspaceId: string, accountId: string) {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id: accountId, workspaceId, isArchived: false },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.providerType !== WhatsAppProviderType.BAILEYS) {
      throw new BadRequestException('Account is not a BAILEYS account');
    }

    await this.baileys.stopSession(accountId);
    return { disconnected: true };
  }

  findOne(workspaceId: string, id: string) {
    return this.prisma.whatsAppAccount.findFirst({
      where: { id, workspaceId },
      include: { session: true },
    });
  }

  archive(workspaceId: string, id: string) {
    return this.prisma.whatsAppAccount.updateMany({
      where: { id, workspaceId },
      data: { isArchived: true },
    });
  }

  pause(workspaceId: string, id: string) {
    return this.prisma.whatsAppAccount.updateMany({
      where: { id, workspaceId },
      data: { isPaused: true },
    });
  }

  resume(workspaceId: string, id: string) {
    return this.prisma.whatsAppAccount.updateMany({
      where: { id, workspaceId },
      data: { isPaused: false },
    });
  }
}
