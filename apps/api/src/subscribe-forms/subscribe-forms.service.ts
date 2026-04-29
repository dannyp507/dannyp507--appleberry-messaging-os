import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { SequencesService } from '../sequences/sequences.service';
import { normalizePhoneE164 } from '../contacts/phone.util';
import type { CreateSubscribeFormDto } from './dto/create-subscribe-form.dto';
import type { SubmitFormDto } from './dto/submit-form.dto';

@Injectable()
export class SubscribeFormsService {
  private readonly logger = new Logger(SubscribeFormsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
    private readonly sequences: SequencesService,
  ) {}

  // ─── CRUD (authenticated) ────────────────────────────────────────────────────

  list(workspaceId: string) {
    return this.prisma.subscribeForm.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        whatsappAccount: { select: { id: true, name: true, phone: true } },
        sequence: { select: { id: true, name: true } },
      },
    });
  }

  async create(workspaceId: string, dto: CreateSubscribeFormDto) {
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    const slug = this.generateSlug(workspace.name);
    return this.prisma.subscribeForm.create({
      data: {
        workspaceId,
        whatsappAccountId: dto.whatsappAccountId,
        sequenceId: dto.sequenceId ?? null,
        slug,
        name: dto.name,
        description: dto.description ?? null,
        welcomeMessage: dto.welcomeMessage ?? null,
        active: dto.active ?? true,
      },
      include: {
        whatsappAccount: { select: { id: true, name: true, phone: true } },
        sequence: { select: { id: true, name: true } },
      },
    });
  }

  async update(
    workspaceId: string,
    id: string,
    dto: Partial<CreateSubscribeFormDto>,
  ) {
    await this._assertOwns(workspaceId, id);
    return this.prisma.subscribeForm.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description ?? null }),
        ...(dto.whatsappAccountId !== undefined && { whatsappAccountId: dto.whatsappAccountId }),
        ...(dto.sequenceId !== undefined && { sequenceId: dto.sequenceId ?? null }),
        ...(dto.welcomeMessage !== undefined && { welcomeMessage: dto.welcomeMessage ?? null }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
      include: {
        whatsappAccount: { select: { id: true, name: true, phone: true } },
        sequence: { select: { id: true, name: true } },
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this._assertOwns(workspaceId, id);
    await this.prisma.subscribeForm.delete({ where: { id } });
    return { id, deleted: true as const };
  }

  // ─── Public submit ───────────────────────────────────────────────────────────

  async getPublicConfig(slug: string) {
    const form = await this.prisma.subscribeForm.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        description: true,
        active: true,
        workspace: { select: { name: true, logoUrl: true } },
      },
    });
    if (!form || !form.active) throw new NotFoundException('Form not found');
    return form;
  }

  async submit(slug: string, dto: SubmitFormDto) {
    const form = await this.prisma.subscribeForm.findUnique({
      where: { slug },
      include: {
        workspace: true,
        whatsappAccount: true,
      },
    });
    if (!form || !form.active) throw new NotFoundException('Form not found');

    const workspaceId = form.workspaceId;
    const account = form.whatsappAccount;

    // Normalize phone
    const { e164, isValid } = normalizePhoneE164(dto.phone, 'ZA');
    if (!e164) throw new BadRequestException('Invalid phone number');

    // Find or create contact
    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone: e164 } },
      create: {
        workspaceId,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() ?? '',
        phone: e164,
        isValid,
        isDuplicate: false,
      },
      update: {
        // Only update name if it's currently "Unknown"
        ...(dto.firstName.trim() && {
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() ?? '',
        }),
      },
    });

    // Create/update subscription
    const subscription = await this.prisma.contactSubscription.upsert({
      where: {
        contactId_whatsappAccountId: {
          contactId: contact.id,
          whatsappAccountId: account.id,
        },
      },
      create: {
        workspaceId,
        contactId: contact.id,
        whatsappAccountId: account.id,
        status: 'SUBSCRIBED',
        subscribedAt: new Date(),
      },
      update: {
        status: 'SUBSCRIBED',
        unsubscribedAt: null,
      },
    });

    // Send welcome message
    const firstName = dto.firstName.trim();
    if (form.welcomeMessage) {
      const message = form.welcomeMessage
        .replace(/\{\{name\}\}/gi, firstName)
        .replace(/\[wa_name\]/gi, firstName);
      await this.messages.enqueueOutboundText({
        workspaceId,
        whatsappAccountId: account.id,
        to: e164,
        message,
        contactId: contact.id,
      });
    }

    // Enroll in sequence
    if (form.sequenceId) {
      try {
        await this.sequences.enroll(workspaceId, form.sequenceId, {
          subscriptionIds: [subscription.id],
          whatsappAccountId: account.id,
        });
      } catch (err: unknown) {
        // Already enrolled or sequence inactive — not fatal
        this.logger.warn(`Sequence enroll skipped for form ${slug}: ${(err as Error)?.message}`);
      }
    }

    // Increment counter
    await this.prisma.subscribeForm.update({
      where: { id: form.id },
      data: { submissionsCount: { increment: 1 } },
    });

    this.logger.log(`Form "${slug}" submission from ${e164}`);
    return { success: true };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async _assertOwns(workspaceId: string, id: string) {
    const row = await this.prisma.subscribeForm.findFirst({
      where: { id, workspaceId },
    });
    if (!row) throw new NotFoundException('Form not found');
    return row;
  }

  private generateSlug(workspaceName: string): string {
    const base = workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${base}-${suffix}`;
  }
}
