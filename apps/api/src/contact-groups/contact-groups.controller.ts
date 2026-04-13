import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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

  @Get(':id')
  findOne(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.groups.findOne(workspace.id, id);
  }

  @Get(':id/members')
  members(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
  ) {
    return this.groups.members(workspace.id, id, {
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 25,
      search,
    });
  }

  @Get(':id/export')
  async export(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const csv = await this.groups.exportCsv(workspace.id, id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="group-${id}.csv"`);
    res.send(csv);
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
