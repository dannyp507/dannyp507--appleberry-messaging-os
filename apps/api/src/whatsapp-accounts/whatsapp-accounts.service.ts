import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateWhatsAppAccountDto } from './dto/create-whatsapp-account.dto';

@Injectable()
export class WhatsappAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.whatsAppAccount.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(workspaceId: string, dto: CreateWhatsAppAccountDto) {
    return this.prisma.whatsAppAccount.create({
      data: {
        workspaceId,
        name: dto.name,
        phone: dto.phone,
        providerType: dto.providerType ?? 'MOCK',
      },
    });
  }
}
