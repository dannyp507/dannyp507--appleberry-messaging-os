import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTemplateDto } from './dto/create-template.dto';
import type { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list(workspaceId: string) {
    return this.prisma.template.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(workspaceId: string, dto: CreateTemplateDto) {
    try {
      return await this.prisma.template.create({
        data: {
          workspaceId,
          name: dto.name,
          content: dto.content,
          type: dto.type ?? 'TEXT',
          header: dto.header,
          footer: dto.footer,
          buttons: dto.buttons as Prisma.InputJsonValue ?? undefined,
          sections: dto.sections as Prisma.InputJsonValue ?? undefined,
          variables: (dto.variables ?? {}) as Prisma.InputJsonValue,
          mediaUrl: dto.mediaUrl ?? null,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `A template named "${dto.name}" already exists. Please use a different name.`,
        );
      }
      throw err;
    }
  }

  async update(workspaceId: string, id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.template.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException('Template not found');
    }
    try {
      return await this.prisma.template.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.content !== undefined && { content: dto.content }),
          ...(dto.type !== undefined && { type: dto.type }),
          // Allow clearing header/footer/mediaUrl by passing empty string or null
          ...(dto.header !== undefined && { header: dto.header || null }),
          ...(dto.footer !== undefined && { footer: dto.footer || null }),
          ...(dto.mediaUrl !== undefined && { mediaUrl: dto.mediaUrl || null }),
          ...(dto.buttons !== undefined && { buttons: dto.buttons as Prisma.InputJsonValue }),
          ...(dto.sections !== undefined && { sections: dto.sections as Prisma.InputJsonValue }),
          ...(dto.variables !== undefined && { variables: dto.variables as Prisma.InputJsonValue }),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `A template named "${dto.name}" already exists. Please use a different name.`,
        );
      }
      throw err;
    }
  }

  async remove(workspaceId: string, id: string) {
    const t = await this.prisma.template.findFirst({
      where: { id, workspaceId },
    });
    if (!t) {
      throw new NotFoundException('Template not found');
    }
    try {
      await this.prisma.template.delete({ where: { id } });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new BadRequestException(
          'This template is used by one or more campaigns. Delete or reassign those campaigns first.',
        );
      }
      throw err;
    }
    return { id, deleted: true as const };
  }
}
