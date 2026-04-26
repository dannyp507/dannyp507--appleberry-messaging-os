import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { Workspace } from '@prisma/client';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_chatbot')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('flow-template')
  createFlowTemplate(
    @CurrentWorkspace() workspace: Workspace,
    @Body() body: { name?: string },
  ) {
    return this.appointments.createBookingFlowTemplate(
      workspace.id,
      body.name?.trim() || 'Appointment Booking',
    );
  }
}
