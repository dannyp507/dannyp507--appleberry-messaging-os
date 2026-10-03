import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import type { WaInteractive } from '../whatsapp-cloud/whatsapp-cloud.types';
import type { SendVoucherCampaignDto } from './dto/send-voucher-campaign.dto';

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);
  private reminderTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────

  onModuleInit() {
    // Check reminders every 2 hours
    this.reminderTimer = setInterval(() => void this.processReminders(), 2 * 60 * 60 * 1000);
    this.logger.log('Voucher reminder scheduler started (every 2h)');
  }

  onModuleDestroy() {
    if (this.reminderTimer) clearInterval(this.reminderTimer);
  }

  // ─────────────────────────────────────────────────────────────────
  // Code generation
  // ─────────────────────────────────────────────────────────────────

  /** Generate a unique voucher code: 2 initials + 2-digit year + 4 hex chars, e.g. DM26-4FAB */
  generateCode(firstName: string, lastName: string): string {
    const year = new Date().getFullYear().toString().slice(-2);
    const i1 = (firstName?.[0] ?? 'X').toUpperCase().replace(/[^A-Z]/, 'X');
    const i2 = (lastName?.[0] ?? 'X').toUpperCase().replace(/[^A-Z]/, 'X');
    const hex = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .toUpperCase()
      .padStart(4, '0');
    return `${i1}${i2}${year}-${hex}`;
  }

  // ─────────────────────────────────────────────────────────────────
  // Campaign send
  // ─────────────────────────────────────────────────────────────────

  async sendCampaign(workspaceId: string, dto: SendVoucherCampaignDto) {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id: dto.whatsappAccountId, workspaceId },
    });
    if (!account) throw new NotFoundException('WhatsApp account not found');

    // Resolve contact IDs
    let contactIds: string[] = dto.contactIds ?? [];
    if (!contactIds.length && dto.contactGroupId) {
      const members = await this.prisma.contactGroupMember.findMany({
        where: { groupId: dto.contactGroupId },
        select: { contactId: true },
      });
      contactIds = members.map((m) => m.contactId);
    }
    if (!contactIds.length) {
      throw new BadRequestException('Provide contactIds or contactGroupId with at least one contact');
    }

    const contacts = await this.prisma.contact.findMany({
      where: { id: { in: contactIds }, workspaceId },
    });
    if (!contacts.length) throw new NotFoundException('No valid contacts found');

    const campaignName = dto.campaignName ?? 'VIP Voucher';
    const valueZar = dto.valueZar ?? 200;
    const daysValid = dto.daysValid ?? 30;
    const delayMs = dto.delayMs ?? 2000;

    const results: { contactId: string; code: string; status: string }[] = [];

    for (const contact of contacts) {
      try {
        // Generate unique code (retry up to 5 times on collision)
        let code = '';
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = this.generateCode(contact.firstName, contact.lastName ?? '');
          const exists = await (this.prisma as any).voucher.findUnique({ where: { code: candidate } }).catch(() => null);
          if (!exists) { code = candidate; break; }
        }
        if (!code) throw new Error('Could not generate unique code after 5 attempts');

        const expiresAt = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000);

        // Create voucher record
        const voucher = await (this.prisma as any).voucher.create({
          data: {
            workspaceId,
            contactId: contact.id,
            whatsappAccountId: account.id,
            code,
            campaignName,
            valueZar,
            status: 'PENDING',
            expiresAt,
          },
        });

        // Build message body
        const firstName = contact.firstName && contact.firstName !== 'Unknown'
          ? contact.firstName
          : 'Valued Client';

        // Use custom wording if provided, else fall back to default
        const defaultBody = [
          `Hi ${firstName}! 🌟`,
          '',
          `As one of our valued VIP clients, we have an exclusive *R${valueZar} voucher* just for you!`,
          '',
          `Tap "Claim Voucher" to receive your unique voucher code. Valid for ${daysValid} days.`,
          '',
          'Thank you for your loyalty! 💎',
        ].join('\n');

        const rawBody = dto.messageBody ?? defaultBody;
        // Replace {{name}} placeholder with actual first name
        const resolvedBody = rawBody.replace(/\{\{name\}\}/gi, firstName);

        // Find or create inbox thread so message shows in inbox
        let thread = await this.prisma.inboxThread.findFirst({
          where: { workspaceId, contactId: contact.id, whatsappAccountId: account.id },
        });
        if (!thread) {
          thread = await this.prisma.inboxThread.create({
            data: {
              workspaceId,
              contactId: contact.id,
              whatsappAccountId: account.id,
              status: 'OPEN',
              lastMessagePreview: `R${valueZar} VIP Voucher sent`,
              lastMessageAt: new Date(),
              unreadCount: 0,
            },
          });
        }

        // Look up approved Meta template (r200_voucher_btn or custom override)
        const tmplName = (dto as any).templateMetaName as string | undefined ?? 'r200_voucher_btn';
        const approvedTemplate = await this.prisma.template.findFirst({
          where: {
            workspaceId,
            metaName: tmplName,
            metaStatus: 'APPROVED',
          } as any,
        }).catch(() => null);

        if (approvedTemplate && account.providerType === 'CLOUD') {
          // Use Meta-approved template — works outside the 24h session window
          // IMPORTANT: the processor regex-extracts variable values by matching the message against
          // the template content. So the message MUST be the template content with {{name}} resolved,
          // NOT the default campaign body (which has different text).
          const tmplContent = (approvedTemplate as any).content as string;
          const tmplResolvedBody = tmplContent.replace(/\{\{name\}\}/gi, firstName);
          this.logger.log(`[Voucher] Using approved template ${tmplName} for contact ${contact.id}`);
          await this.messages.enqueueOutboundText({
            workspaceId,
            whatsappAccountId: account.id,
            to: contact.phone,
            message: tmplResolvedBody,
            contactId: contact.id,
            inboxThreadId: thread.id,
            templateId: approvedTemplate.id,
          });
        } else {
          // Fallback: interactive button (works only within 24h session window)
          if (!approvedTemplate) {
            this.logger.warn(`[Voucher] No approved template "${tmplName}" found — falling back to interactive button`);
          }
          const headerText = (dto.headerText ?? `🎉 R${valueZar} VIP Voucher`).slice(0, 60);
          const expiryFormatted = expiresAt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
          const footerText = (dto.footerText ?? `Offer expires ${expiryFormatted}`).slice(0, 60);
          const buttonLabel = (dto.buttonLabel ?? '🎁 Claim Voucher').slice(0, 20);

          const interactive: WaInteractive = {
            type: 'button',
            header: { type: 'text', text: headerText },
            body: { text: resolvedBody },
            footer: { text: footerText },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: { id: 'claim_voucher', title: buttonLabel },
                },
              ],
            },
          };

          await this.messages.enqueueOutboundInteractive({
            workspaceId,
            whatsappAccountId: account.id,
            to: contact.phone,
            interactive,
            contactId: contact.id,
            inboxThreadId: thread.id,
          });
        }

        // Mark voucher as SENT
        await (this.prisma as any).voucher.update({
          where: { id: voucher.id },
          data: { status: 'SENT', sentAt: new Date() },
        });

        results.push({ contactId: contact.id, code, status: 'sent' });
        this.logger.log(`[Voucher] Sent ${code} to contact ${contact.id}`);

        // Rate-limit delay
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err) {
        this.logger.error(`[Voucher] Failed to send to contact ${contact.id}: ${(err as Error)?.message}`);
        results.push({ contactId: contact.id, code: '', status: 'failed' });
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    return { sent, failed, results };
  }

  // ─────────────────────────────────────────────────────────────────
  // Claim (client taps button → we send the code)
  // ─────────────────────────────────────────────────────────────────

  async claimVoucher(params: {
    workspaceId: string;
    contactId: string;
    whatsappAccountId: string;
    to: string;
    inboxThreadId: string;
  }): Promise<boolean> {
    const now = new Date();

    // Find a SENT voucher for this contact (not expired)
    const voucher = await (this.prisma as any).voucher.findFirst({
      where: {
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        status: 'SENT',
        expiresAt: { gt: now },
      },
      orderBy: { sentAt: 'desc' },
    });

    if (!voucher) {
      // No active voucher — inform the contact
      await this.messages.enqueueOutboundText({
        workspaceId: params.workspaceId,
        whatsappAccountId: params.whatsappAccountId,
        to: params.to,
        message:
          "Sorry, we couldn't find an active voucher for your account. Please contact us if you believe this is an error. 😊",
        contactId: params.contactId,
        inboxThreadId: params.inboxThreadId,
      });
      return true;
    }

    // Mark as CLAIMED
    await (this.prisma as any).voucher.update({
      where: { id: voucher.id },
      data: { status: 'CLAIMED', claimedAt: now },
    });

    const expiryStr = new Date(voucher.expiresAt).toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    await this.messages.enqueueOutboundText({
      workspaceId: params.workspaceId,
      whatsappAccountId: params.whatsappAccountId,
      to: params.to,
      message: [
        `🎁 Your exclusive R${voucher.valueZar} voucher code is:`,
        '',
        `*${voucher.code}*`,
        '',
        `Show this code in-store to redeem your R${voucher.valueZar} discount.`,
        `📅 Valid until: ${expiryStr}`,
        '',
        'Thank you for being a valued VIP client! 💎',
        '',
        'Is there anything else I can help you with?',
      ].join('\n'),
      contactId: params.contactId,
      inboxThreadId: params.inboxThreadId,
    });

    this.logger.log(`[Voucher] ${voucher.code} claimed by contact ${params.contactId}`);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────
  // Redeem (in-store staff marks voucher as redeemed)
  // ─────────────────────────────────────────────────────────────────

  async getVoucherByCode(code: string) {
    const voucher = await (this.prisma as any).voucher.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });
    if (!voucher) throw new NotFoundException(`Voucher code "${code}" not found`);
    return voucher;
  }

  async redeemVoucher(code: string) {
    const voucher = await this.getVoucherByCode(code);

    if (voucher.status === 'REDEEMED') {
      throw new BadRequestException(`Voucher ${code} has already been redeemed`);
    }
    if (voucher.status === 'EXPIRED') {
      throw new BadRequestException(`Voucher ${code} has expired`);
    }
    if (new Date(voucher.expiresAt) < new Date()) {
      await (this.prisma as any).voucher.update({
        where: { id: voucher.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException(`Voucher ${code} has expired`);
    }
    if (voucher.status === 'PENDING' || voucher.status === 'SENT') {
      throw new BadRequestException(`Voucher ${code} has not been claimed yet`);
    }

    const updated = await (this.prisma as any).voucher.update({
      where: { id: voucher.id },
      data: { status: 'REDEEMED', redeemedAt: new Date() },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });
    this.logger.log(`[Voucher] ${code} redeemed`);
    return updated;
  }

  // ─────────────────────────────────────────────────────────────────
  // List vouchers for a workspace
  // ─────────────────────────────────────────────────────────────────

  async listVouchers(workspaceId: string, filters?: {
    status?: string;
    campaignName?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 50, 200);
    const skip = (page - 1) * pageSize;

    const where: any = { workspaceId };
    if (filters?.status) where.status = filters.status;
    if (filters?.campaignName) where.campaignName = filters.campaignName;

    const [items, total] = await Promise.all([
      (this.prisma as any).voucher.findMany({
        where,
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      (this.prisma as any).voucher.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  // ─────────────────────────────────────────────────────────────────
  // Reminder cron (day 3 + day 7 after sending)
  // ─────────────────────────────────────────────────────────────────

  async processReminders() {
    const now = new Date();

    // Day-3 reminder: sent 3-4 days ago, not yet reminded, status=SENT
    const day3Min = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
    const day3Max = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const day3Vouchers = await (this.prisma as any).voucher.findMany({
      where: {
        status: 'SENT',
        sentAt: { gte: day3Min, lte: day3Max },
        reminder1SentAt: null,
        expiresAt: { gt: now },
      },
      include: {
        contact: { select: { id: true, firstName: true, phone: true } },
      },
    });

    for (const v of day3Vouchers) {
      try {
        const firstName = v.contact?.firstName && v.contact.firstName !== 'Unknown'
          ? v.contact.firstName
          : 'Valued Client';
        const expiryStr = new Date(v.expiresAt).toLocaleDateString('en-ZA', {
          day: 'numeric', month: 'long', year: 'numeric',
        });

        const thread = await this.prisma.inboxThread.findFirst({
          where: { workspaceId: v.workspaceId, contactId: v.contactId, whatsappAccountId: v.whatsappAccountId },
        });

        await this.messages.enqueueOutboundText({
          workspaceId: v.workspaceId,
          whatsappAccountId: v.whatsappAccountId,
          to: v.contact.phone,
          message: `👋 Hi ${firstName}! Just a friendly reminder that your exclusive *R${v.valueZar} VIP voucher* is still waiting to be claimed!\n\nTap the button in our earlier message to get your unique code.\n\n📅 Expires: ${expiryStr}`,
          contactId: v.contactId,
          inboxThreadId: thread?.id,
        });

        await (this.prisma as any).voucher.update({
          where: { id: v.id },
          data: { reminder1SentAt: now },
        });
        this.logger.log(`[Voucher] Day-3 reminder sent for ${v.code}`);
      } catch (err) {
        this.logger.error(`[Voucher] Day-3 reminder failed for ${v.code}: ${(err as Error)?.message}`);
      }
    }

    // Day-7 reminder: sent 7-8 days ago, not yet day-7 reminded, status=SENT
    const day7Min = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const day7Max = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const day7Vouchers = await (this.prisma as any).voucher.findMany({
      where: {
        status: 'SENT',
        sentAt: { gte: day7Min, lte: day7Max },
        reminder2SentAt: null,
        expiresAt: { gt: now },
      },
      include: {
        contact: { select: { id: true, firstName: true, phone: true } },
      },
    });

    for (const v of day7Vouchers) {
      try {
        const firstName = v.contact?.firstName && v.contact.firstName !== 'Unknown'
          ? v.contact.firstName
          : 'Valued Client';
        const daysLeft = Math.ceil(
          (new Date(v.expiresAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
        );
        const expiryStr = new Date(v.expiresAt).toLocaleDateString('en-ZA', {
          day: 'numeric', month: 'long', year: 'numeric',
        });

        const thread = await this.prisma.inboxThread.findFirst({
          where: { workspaceId: v.workspaceId, contactId: v.contactId, whatsappAccountId: v.whatsappAccountId },
        });

        await this.messages.enqueueOutboundText({
          workspaceId: v.workspaceId,
          whatsappAccountId: v.whatsappAccountId,
          to: v.contact.phone,
          message: `⏰ Hi ${firstName}! Your R${v.valueZar} VIP voucher expires in *${daysLeft} days* (${expiryStr})!\n\nDon't miss out — tap the button in our earlier message to claim your voucher code. 🎁`,
          contactId: v.contactId,
          inboxThreadId: thread?.id,
        });

        await (this.prisma as any).voucher.update({
          where: { id: v.id },
          data: { reminder2SentAt: now },
        });
        this.logger.log(`[Voucher] Day-7 reminder sent for ${v.code}`);
      } catch (err) {
        this.logger.error(`[Voucher] Day-7 reminder failed for ${v.code}: ${(err as Error)?.message}`);
      }
    }

    // Expire overdue SENT/CLAIMED vouchers
    await (this.prisma as any).voucher.updateMany({
      where: {
        status: { in: ['SENT', 'CLAIMED'] },
        expiresAt: { lt: now },
      },
      data: { status: 'EXPIRED' },
    });
  }
}
