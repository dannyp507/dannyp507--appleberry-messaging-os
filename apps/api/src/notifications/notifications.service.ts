import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import type { PushSubscribeDto } from './dto/push-subscribe.dto';

export interface CreateNotificationDto {
  workspaceId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  /** Browser push payload — if omitted no push is sent */
  push?: { title: string; body: string; url?: string; tag?: string };
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private vapidReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    const sub = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@appleberry.app';
    if (pub && priv) {
      webpush.setVapidDetails(sub, pub, priv);
      this.vapidReady = true;
      this.logger.log('Web Push (VAPID) initialised');
    } else {
      this.logger.warn('VAPID keys not set — browser push notifications disabled');
    }
  }

  // ── VAPID public key (exposed to frontend) ──────────────────────────────────
  getVapidPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  // ── Push subscriptions ──────────────────────────────────────────────────────
  async savePushSubscription(workspaceId: string, dto: PushSubscribeDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      update: { p256dh: dto.keys.p256dh, auth: dto.keys.auth, userAgent: dto.userAgent },
      create: {
        workspaceId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent,
      },
    });
  }

  async removePushSubscription(workspaceId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { workspaceId, endpoint },
    });
  }

  // ── Send browser push to all subscriptions for a workspace ──────────────────
  async sendPush(
    workspaceId: string,
    payload: { title: string; body: string; url?: string; tag?: string },
  ) {
    if (!this.vapidReady) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { workspaceId },
    });
    const json = JSON.stringify(payload);
    await Promise.allSettled(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            json,
          );
        } catch (err: unknown) {
          // 410 Gone = subscription expired, clean it up
          if ((err as { statusCode?: number }).statusCode === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          } else {
            this.logger.warn(`Push send failed for sub ${s.id}: ${(err as Error).message}`);
          }
        }
      }),
    );
  }

  // ── In-app notifications ────────────────────────────────────────────────────
  async create(dto: CreateNotificationDto) {
    const notification = await this.prisma.notification.create({
      data: {
        workspaceId: dto.workspaceId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        link: dto.link ?? null,
      },
    });

    // Fire-and-forget browser push
    if (dto.push) {
      void this.sendPush(dto.workspaceId, dto.push);
    }

    return notification;
  }

  async list(workspaceId: string, take = 30) {
    return this.prisma.notification.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async unreadCount(workspaceId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { workspaceId, isRead: false },
    });
  }

  async markRead(workspaceId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, workspaceId },
      data: { isRead: true },
    });
  }

  async markAllRead(workspaceId: string) {
    return this.prisma.notification.updateMany({
      where: { workspaceId, isRead: false },
      data: { isRead: true },
    });
  }
}
