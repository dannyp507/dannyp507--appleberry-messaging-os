import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CONTACTS_IMPORT_QUEUE, type ContactsImportJob } from '../queue/queue.constants';
import { normalizePhoneE164 } from './phone.util';
import type { CreateContactDto } from './dto/create-contact.dto';
import type { ListContactsQueryDto } from './dto/list-contacts.query';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CONTACTS_IMPORT_QUEUE) private readonly importQueue: Queue,
  ) {}

  async list(workspaceId: string, query: ListContactsQueryDto) {
    const take = query.take ?? 50;
    const skip = query.skip ?? 0;
    const where = {
      workspaceId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { tags: { include: { tag: true } } },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  async create(workspaceId: string, dto: CreateContactDto) {
    const { e164, isValid } = normalizePhoneE164(
      dto.phone,
      dto.defaultCountry ?? 'ZA',
    );
    if (!isValid) {
      throw new BadRequestException('Invalid phone number');
    }

    const exists = await this.prisma.contact.findFirst({
      where: { workspaceId, phone: e164 },
    });

    const contact = await this.prisma.contact.create({
      data: {
        workspaceId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: e164,
        email: dto.email ?? null,
        isValid: true,
        isDuplicate: !!exists,
      },
    });

    if (dto.tagNames?.length) {
      for (const name of dto.tagNames) {
        const tag = await this.prisma.tag.upsert({
          where: { workspaceId_name: { workspaceId, name } },
          update: {},
          create: { workspaceId, name },
        });
        await this.prisma.contactTag.create({
          data: { contactId: contact.id, tagId: tag.id },
        });
      }
    }

    return this.prisma.contact.findUniqueOrThrow({
      where: { id: contact.id },
      include: { tags: { include: { tag: true } } },
    });
  }

  async remove(workspaceId: string, id: string) {
    const c = await this.prisma.contact.findFirst({
      where: { id, workspaceId },
    });
    if (!c) {
      throw new NotFoundException('Contact not found');
    }
    await this.prisma.contact.delete({ where: { id } });
    return { id, deleted: true as const };
  }

  async enqueueImport(
    workspaceId: string,
    filePath: string,
    groupId?: string,
    defaultCountry?: string,
  ) {
    const job: ContactsImportJob = {
      workspaceId,
      filePath,
      groupId,
      defaultCountry,
    };
    await this.importQueue.add('import-csv', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
    return { queued: true as const };
  }
}
