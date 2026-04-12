import { Controller, Get, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { BillingService } from '../billing/billing.service';

@Controller('analytics')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('view_reports')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly billing: BillingService,
  ) {}

  @Get('dashboard')
  async dashboard(@CurrentWorkspace() workspace: Workspace) {
    const periodKey = this.billing.periodKey();
    const [outboundMessagesThisMonth, outboundLimit] = await Promise.all([
      this.billing.getOutboundUsage(workspace.id, periodKey),
      this.billing.getOutboundLimit(workspace.id),
    ]);
    return this.analytics.dashboard(workspace.id, {
      periodKey,
      outboundMessagesThisMonth,
      outboundLimit,
    });
  }
}
