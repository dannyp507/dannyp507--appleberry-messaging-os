import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.template.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(workspaceId: string, dto: CreateTemplateDto) {
    return this.prisma.template.create({
      data: {
        workspaceId,
        name: dto.name,
        content: dto.content,
        type: dto.type ?? 'TEXT',
        variables: (dto.variables ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    const t = await this.prisma.template.findFirst({
      where: { id, workspaceId },
    });
    if (!t) {
      throw new NotFoundException('Template not found');
    }
    await this.prisma.template.delete({ where: { id } });
    return { id, deleted: true as const };
  }
}
