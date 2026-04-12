import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhoneE164 } from '../contacts/phone.util';
import { CONTACTS_IMPORT_QUEUE, type ContactsImportJob } from './queue.constants';

@Processor(CONTACTS_IMPORT_QUEUE, { concurrency: 2 })
export class ContactsImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ContactsImportProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ContactsImportJob, void, string>): Promise<void> {
    const { workspaceId, filePath, groupId, defaultCountry } = job.data;

    let raw: string;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (e) {
      this.logger.error(`Cannot read import file ${filePath}: ${e}`);
      return;
    } finally {
      await fs.unlink(filePath).catch(() => undefined);
    }

    const rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    let created = 0;
    let skippedInvalid = 0;
    let duplicates = 0;

    for (const row of rows) {
      const firstName = row.firstName ?? row.FirstName ?? row.first_name ?? '';
      const lastName = row.lastName ?? row.LastName ?? row.last_name ?? '';
      const phoneRaw = row.phone ?? row.Phone ?? row.mobile ?? '';
      const email = row.email ?? row.Email ?? undefined;
      const tagsRaw = row.tags ?? row.Tags ?? '';

      const { e164, isValid } = normalizePhoneE164(
        phoneRaw,
        defaultCountry ?? 'ZA',
      );

      if (!isValid) {
        skippedInvalid += 1;
        continue;
      }

      const exists = await this.prisma.contact.findFirst({
        where: { workspaceId, phone: e164 },
      });

      const isDuplicate = !!exists;

      const contact = await this.prisma.contact.create({
        data: {
          workspaceId,
          firstName: firstName || 'Unknown',
          lastName: lastName || '',
          phone: e164,
          email: email || null,
          isValid: true,
          isDuplicate,
        },
      });

      if (isDuplicate) {
        duplicates += 1;
      }
      created += 1;

      if (tagsRaw) {
        const tagNames = tagsRaw
          .split(/[|,]/)
          .map((t) => t.trim())
          .filter(Boolean);
        for (const name of tagNames) {
          const tag = await this.prisma.tag.upsert({
            where: {
              workspaceId_name: { workspaceId, name },
            },
            update: {},
            create: { workspaceId, name },
          });
          await this.prisma.contactTag.upsert({
            where: {
              contactId_tagId: { contactId: contact.id, tagId: tag.id },
            },
            update: {},
            create: { contactId: contact.id, tagId: tag.id },
          });
        }
      }

      if (groupId) {
        await this.prisma.contactGroupMember.upsert({
          where: {
            contactId_groupId: { contactId: contact.id, groupId },
          },
          update: {},
          create: { contactId: contact.id, groupId },
        });
      }
    }

    this.logger.log(
      `Import ${workspaceId}: created=${created}, invalidSkipped=${skippedInvalid}, duplicateFlags=${duplicates}`,
    );
  }
}
