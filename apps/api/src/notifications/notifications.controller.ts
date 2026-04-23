import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Workspace } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { NotificationsService } from './notifications.service';
import { PushSubscribeDto } from './dto/push-subscribe.dto';

@UseGuards(JwtAuthGuard, WorkspaceContextGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  /** VAPID public key — used by the browser to subscribe to push */
  @Get('push/vapid-key')
  vapidKey() {
    return { publicKey: this.svc.getVapidPublicKey() };
  }

  /** Save (or refresh) a browser push subscription */
  @Post('push/subscribe')
  subscribe(@CurrentWorkspace() ws: Workspace, @Body() dto: PushSubscribeDto) {
    return this.svc.savePushSubscription(ws.id, dto);
  }

  /** Remove a push subscription (e.g. when user disables notifications) */
  @Delete('push/subscribe')
  unsubscribe(@CurrentWorkspace() ws: Workspace, @Body('endpoint') endpoint: string) {
    return this.svc.removePushSubscription(ws.id, endpoint);
  }

  /** Count of unread in-app notifications */
  @Get('unread-count')
  unreadCount(@CurrentWorkspace() ws: Workspace) {
    return this.svc.unreadCount(ws.id).then((count) => ({ count }));
  }

  /** List recent notifications */
  @Get()
  list(@CurrentWorkspace() ws: Workspace, @Query('take') take?: string) {
    return this.svc.list(ws.id, take ? parseInt(take, 10) : 30);
  }

  /** Mark one as read */
  @Patch(':id/read')
  markRead(@CurrentWorkspace() ws: Workspace, @Param('id') id: string) {
    return this.svc.markRead(ws.id, id);
  }

  /** Mark all as read */
  @Patch('read-all')
  markAllRead(@CurrentWorkspace() ws: Workspace) {
    return this.svc.markAllRead(ws.id);
  }
}
