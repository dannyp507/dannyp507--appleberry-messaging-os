import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { ContactGroupsService } from './contact-groups.service';
import { AddContactsToGroupDto } from './dto/add-contacts-to-group.dto';
import { CreateContactGroupDto } from './dto/create-contact-group.dto';

@Controller('contact-groups')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_contacts')
export class ContactGroupsController {
  constructor(private readonly groups: ContactGroupsService) {}

  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.groups.list(workspace.id);
  }

  @Post()
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateContactGroupDto,
  ) {
    return this.groups.create(workspace.id, dto);
  }

  @Post(':id/add')
  add(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddContactsToGroupDto,
  ) {
    return this.groups.addContacts(workspace.id, id, dto);
  }
}
