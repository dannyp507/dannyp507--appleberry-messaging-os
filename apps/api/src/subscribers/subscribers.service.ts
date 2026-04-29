import { Injectable, NotFoundException } from '@nestjs/common';
import { SubscriberStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListSubscribersDto } from './dto/list-subscribers.dto';

@Injectable()
export class SubscribersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── List ────────────────────────────────────────────────────────────────────

  async list(workspaceId: string, query: ListSubscribersDto) {
    const { accountId, status, search, skip = 0, take = 50 } = query;

    const where: Record<string, unknown> = {
      workspaceId,
      ...(accountId ? { whatsappAccountId: accountId } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            contact: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contactSubscription.findMany({
        where,
        skip,
        take,
        orderBy: { subscribedAt: 'desc' },
        include: {
          contact: {
            include: { tags: { include: { tag: true } } },
          },
          whatsappAccount: { select: { id: true, name: true, phone: true } },
        },
      }),
      this.prisma.contactSubscription.count({ where }),
    ]);

    return { items, total, skip, take };
  }

  // ─── Update status ────────────────────────────────────────────────────────

  async updateStatus(
    workspaceId: string,
    id: string,
    status: SubscriberStatus,
  ) {
    const sub = await this.prisma.contactSubscription.findFirst({
      where: { id, workspaceId },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    return this.prisma.contactSubscription.update({
      where: { id },
      data: {
        status,
        unsubscribedAt:
          status === SubscriberStatus.UNSUBSCRIBED ? new Date() : null,
      },
      include: {
        contact: { include: { tags: { include: { tag: true } } } },
        whatsappAccount: { select: { id: true, name: true, phone: true } },
      },
    });
  }

  // ─── Assign tag ───────────────────────────────────────────────────────────

  async assignTag(workspaceId: string, id: string, tagId: string) {
    const sub = await this.prisma.contactSubscription.findFirst({
      where: { id, workspaceId },
      select: { contactId: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, workspaceId },
    });
    if (!tag) throw new NotFoundException('Tag not found');

    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: sub.contactId, tagId } },
      create: { contactId: sub.contactId, tagId },
      update: {},
    });

    return { success: true };
  }

  // ─── Remove tag ───────────────────────────────────────────────────────────

  async removeTag(workspaceId: string, id: string, tagId: string) {
    const sub = await this.prisma.contactSubscription.findFirst({
      where: { id, workspaceId },
      select: { contactId: true },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    await this.prisma.contactTag.deleteMany({
      where: { contactId: sub.contactId, tagId },
    });

    return { success: true };
  }

  // ─── Export CSV ───────────────────────────────────────────────────────────

  async exportCsv(workspaceId: string, accountId?: string): Promise<string> {
    const subs = await this.prisma.contactSubscription.findMany({
      where: {
        workspaceId,
        ...(accountId ? { whatsappAccountId: accountId } : {}),
      },
      orderBy: { subscribedAt: 'desc' },
      include: {
        contact: { include: { tags: { include: { tag: true } } } },
        whatsappAccount: { select: { name: true, phone: true } },
      },
    });

    const header = [
      'Phone',
      'First Name',
      'Last Name',
      'Status',
      'Subscribed At',
      'Tags',
      'Account',
    ].join(',');

    const rows = subs.map((s) => {
      const tags = s.contact.tags.map((ct) => ct.tag.name).join('; ');
      return [
        s.contact.phone,
        `"${s.contact.firstName}"`,
        `"${s.contact.lastName}"`,
        s.status,
        s.subscribedAt.toISOString(),
        `"${tags}"`,
        `"${s.whatsappAccount.name}"`,
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  // ─── Auto-upsert (called from inbound handler) ────────────────────────────

  async upsertFromInbound(
    workspaceId: string,
    contactId: string,
    whatsappAccountId: string,
  ) {
    await this.prisma.contactSubscription.upsert({
      where: { contactId_whatsappAccountId: { contactId, whatsappAccountId } },
      create: { workspaceId, contactId, whatsappAccountId },
      update: {}, // don't overwrite if already unsubscribed
    });
  }
}
