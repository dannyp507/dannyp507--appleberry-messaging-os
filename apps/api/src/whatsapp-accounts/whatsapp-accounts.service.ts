import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { BaileysSessionService } from '../baileys/baileys-session.service';
import type { CreateWhatsAppAccountDto } from './dto/create-whatsapp-account.dto';
import * as QRCode from 'qrcode';

@Injectable()
export class WhatsappAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly baileys: BaileysSessionService,
  ) {}

  list(workspaceId: string) {
    return this.prisma.whatsAppAccount.findMany({
      where: { workspaceId, isArchived: false },
      orderBy: { createdAt: 'asc' },
      include: { session: { select: { status: true, qrCode: true, lastConnectedAt: true } } },
    });
  }

  async create(workspaceId: string, dto: CreateWhatsAppAccountDto) {
    await this.billing.assertCanCreateWhatsAppAccount(workspaceId);

    const account = await this.prisma.whatsAppAccount.create({
      data: {
        workspaceId,
        name: dto.name,
        phone: dto.phone,
        providerType: dto.providerType ?? 'MOCK',
      },
    });

    if (account.providerType === 'BAILEYS') {
      // Start session async so HTTP response is fast
      void this.baileys.startSession(account.id);
    }

    return account;
  }

  async findOne(workspaceId: string, id: string) {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id, workspaceId },
      include: { session: true },
    });
    if (!account) throw new NotFoundException('WhatsApp account not found');
    return account;
  }

  async getQrCode(workspaceId: string, id: string) {
    const qrString = this.baileys.getQrCode(id);
    const status = this.baileys.getStatus(id);

    if (!qrString) {
      return { qrDataUrl: null, status };
    }

    // Generate QR as proper PNG data URL server-side (white bg, black modules)
    const qrDataUrl = await QRCode.toDataURL(qrString, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    return { qrDataUrl, status };
  }

  async startBaileysSession(workspaceId: string, id: string) {
    const account = await this.findOne(workspaceId, id);
    if (account.providerType !== 'BAILEYS') {
      throw new Error('Account is not a BAILEYS provider');
    }
    await this.baileys.startSession(id);
    return { started: true };
  }

  async disconnectBaileysSession(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    await this.baileys.disconnectSession(id);
    return { disconnected: true };
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
