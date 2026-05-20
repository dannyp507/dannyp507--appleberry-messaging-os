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

    if (rows.length === 0) {
      this.logger.warn(`Import ${workspaceId}: CSV is empty`);
      return;
    }

    // Log the first row's column names so we can diagnose mismatches
    const sampleKeys = Object.keys(rows[0]);
    this.logger.log(`Import ${workspaceId}: ${rows.length} rows, columns: [${sampleKeys.join(', ')}]`);

    let created = 0;
    let skippedInvalid = 0;
    let duplicates = 0;
    const sampleSkipped: string[] = [];

    for (const row of rows) {
      // ── Name: try many common column name variants ─────────────────────────
      const firstName =
        pick(row, ['firstName', 'FirstName', 'first_name', 'First Name', 'firstname', 'name', 'Name']) ?? '';
      const lastName =
        pick(row, ['lastName', 'LastName', 'last_name', 'Last Name', 'lastname', 'surname', 'Surname']) ?? '';

      // ── Phone: try every common variant ────────────────────────────────────
      const phoneRaw =
        pick(row, [
          'phone', 'Phone', 'mobile', 'Mobile', 'cell', 'Cell',
          'phone_number', 'Phone Number', 'PhoneNumber', 'phone number',
          'whatsapp', 'WhatsApp', 'contact', 'Contact',
          'telephone', 'Telephone', 'tel', 'Tel',
          'number', 'Number',
        ]) ?? '';

      const email =
        pick(row, ['email', 'Email', 'e-mail', 'E-mail', 'E-Mail']) ?? undefined;

      const tagsRaw =
        pick(row, ['tags', 'Tags', 'tag', 'Tag', 'groups', 'Groups']) ?? '';

      if (!phoneRaw.trim()) {
        skippedInvalid += 1;
        if (sampleSkipped.length < 5) sampleSkipped.push(`[empty phone] row: ${JSON.stringify(row)}`);
        continue;
      }

      // ── Phone normalisation with fallbacks ─────────────────────────────────
      let e164 = '';
      let isValid = false;

      // Try as-is first
      ({ e164, isValid } = normalizePhoneE164(phoneRaw.trim(), defaultCountry ?? 'ZA'));

      // If that failed and it looks like a local number (8-9 digits, starts with 6-9)
      // try prepending a zero so libphonenumber can parse it as a local ZA number.
      if (!isValid && /^[6-9]\d{7,8}$/.test(phoneRaw.replace(/\D/g, ''))) {
        ({ e164, isValid } = normalizePhoneE164('0' + phoneRaw.replace(/\D/g, ''), defaultCountry ?? 'ZA'));
      }

      if (!isValid) {
        skippedInvalid += 1;
        if (sampleSkipped.length < 5) sampleSkipped.push(`[bad phone: "${phoneRaw}"]`);
        continue;
      }

      const existing = await this.prisma.contact.findFirst({
        where: { workspaceId, phone: e164 },
      });

      let contact: { id: string };

      if (existing) {
        // Phone already in workspace — skip creation, still add to group below
        duplicates += 1;
        contact = existing;
      } else {
        try {
          contact = await this.prisma.contact.create({
            data: {
              workspaceId,
              firstName: firstName || 'Unknown',
              lastName: lastName || '',
              phone: e164,
              email: email || null,
              isValid: true,
              isDuplicate: false,
            },
          });
          created += 1;
        } catch (err: unknown) {
          // P2002 = unique constraint — race condition between two concurrent imports
          if ((err as { code?: string }).code === 'P2002') {
            duplicates += 1;
            const race = await this.prisma.contact.findFirst({ where: { workspaceId, phone: e164 } });
            if (!race) continue;
            contact = race;
          } else {
            throw err;
          }
        }
      }

      if (tagsRaw) {
        const tagNames = tagsRaw
          .split(/[|,;]/)
          .map((t) => t.trim())
          .filter(Boolean);
        for (const name of tagNames) {
          const tag = await this.prisma.tag.upsert({
            where: { workspaceId_name: { workspaceId, name } },
            update: {},
            create: { workspaceId, name },
          });
          await this.prisma.contactTag.upsert({
            where: { contactId_tagId: { contactId: contact.id, tagId: tag.id } },
            update: {},
            create: { contactId: contact.id, tagId: tag.id },
          });
        }
      }

      if (groupId) {
        await this.prisma.contactGroupMember.upsert({
          where: { contactId_groupId: { contactId: contact.id, groupId } },
          update: {},
          create: { contactId: contact.id, groupId },
        });
      }
    }

    this.logger.log(
      `Import ${workspaceId}: created=${created}, invalidSkipped=${skippedInvalid}, duplicateFlags=${duplicates}`,
    );
    if (sampleSkipped.length > 0) {
      this.logger.warn(`Import ${workspaceId}: sample of skipped rows: ${sampleSkipped.join(' | ')}`);
    }
  }
}

/** Case-insensitive key lookup across a list of possible column name variants */
function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k];
  }
  // Fallback: case-insensitive search
  const lower = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const val = lower[k.toLowerCase()];
    if (val !== undefined) return val;
  }
  return undefined;
}
