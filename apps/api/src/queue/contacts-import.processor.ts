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

    // Case-insensitive column lookup helper
    const col = (row: Record<string, string>, ...keys: string[]): string => {
      const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]));
      for (const k of keys) {
        const v = lower[k.toLowerCase()];
        if (v !== undefined && v !== '') return v.trim();
      }
      return '';
    };

    for (const row of rows) {
      // Accept many common export formats from phones, Google Contacts, Excel, CRMs
      const fullName = col(row, 'name', 'full name', 'fullname', 'contact name', 'display name');
      const firstName = col(row, 'firstname', 'first name', 'first_name', 'given name', 'forename')
        || (fullName ? fullName.split(' ')[0] : '');
      const lastName = col(row, 'lastname', 'last name', 'last_name', 'surname', 'family name')
        || (fullName && fullName.includes(' ') ? fullName.split(' ').slice(1).join(' ') : '');
      const phoneRaw = col(row,
        'phone', 'phone number', 'phonenumber', 'phone_number',
        'mobile', 'mobile number', 'mobilenumber', 'mobile_number',
        'cell', 'cell number', 'cellnumber', 'cell_number',
        'telephone', 'tel', 'whatsapp', 'whatsapp number',
        'contact', 'number',
      );
      const email = col(row, 'email', 'email address', 'emailaddress') || undefined;
      const tagsRaw = col(row, 'tags', 'tag', 'labels', 'categories', 'group');

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
