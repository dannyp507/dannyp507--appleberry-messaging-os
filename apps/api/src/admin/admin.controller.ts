import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus, BillingEventType } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin')
@Public()
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow('ADMIN_SECRET');
  }

  private checkSecret(secret: string) {
    if (!secret || secret !== this.secret) {
      throw new ForbiddenException('Invalid admin secret.');
    }
  }

  /** GET /admin/users/:email/workspace — find workspace ID by user email */
  @Get('users/:email/workspace')
  async getWorkspaceByEmail(
    @Param('email') email: string,
    @Headers('x-admin-secret') secret: string,
  ) {
    this.checkSecret(secret);
    const membership = await this.prisma.workspaceMembership.findFirst({
      where: { user: { email } },
      include: { workspace: true },
    });
    if (!membership) throw new NotFoundException(`No workspace found for ${email}`);
    return { email, workspaceId: membership.workspaceId, workspaceName: membership.workspace.name };
  }

  /** POST /admin/workspaces/:id/activate — assign whatsapp-starter plan */
  @Post('workspaces/:id/activate')
  async activateWorkspace(
    @Param('id', ParseUUIDPipe) workspaceId: string,
    @Headers('x-admin-secret') secret: string,
  ) {
    this.checkSecret(secret);
    return this.assignPlan(workspaceId, 'whatsapp-starter', 'admin');
  }

  /** POST /admin/workspaces/:id/plan/:slug — assign any plan by slug */
  @Post('workspaces/:id/plan/:slug')
  async assignPlanRoute(
    @Param('id', ParseUUIDPipe) workspaceId: string,
    @Param('slug') slug: string,
    @Headers('x-admin-secret') secret: string,
  ) {
    this.checkSecret(secret);
    return this.assignPlan(workspaceId, slug, 'admin');
  }

  private async assignPlan(workspaceId: string, planSlug: string, activatedBy: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException(`Workspace ${workspaceId} not found`);

    const plan = await this.prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan) throw new NotFoundException(`Plan "${planSlug}" not seeded`);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    await this.prisma.subscription.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
      update: {
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelledAt: null,
      },
    });

    await this.billing.recordBillingEvent(workspaceId, BillingEventType.SUBSCRIPTION_CREATED, {
      activatedBy,
      plan: planSlug,
    });

    this.logger.log(`Admin assigned workspace ${workspaceId} to plan "${planSlug}"`);
    return { ok: true, workspaceId, plan: planSlug };
  }
}
