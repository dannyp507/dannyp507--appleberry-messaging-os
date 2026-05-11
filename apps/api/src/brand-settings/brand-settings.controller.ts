import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { BrandSettingsService } from './brand-settings.service';
import { UpsertBrandSettingsDto } from './dto/upsert-brand-settings.dto';

@Controller('brand-settings')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin')
@Permissions('manage_settings')
export class BrandSettingsController {
  constructor(private readonly service: BrandSettingsService) {}

  @Get()
  get(@CurrentWorkspace() workspace: Workspace) {
    return this.service.get(workspace.id);
  }

  @Put()
  upsert(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: UpsertBrandSettingsDto,
  ) {
    return this.service.upsert(workspace.id, dto);
  }
}
