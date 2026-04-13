import { Controller, Get, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';

@Controller('billing')
@UseGuards(WorkspaceContextGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('usage')
  getUsage(@CurrentWorkspace() ws: Workspace) {
    return this.billing.getUsageSummary(ws.id);
  }
}
