import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Workspace } from '@prisma/client';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { SequencesService } from './sequences.service';
import { CreateSequenceDto, CreateDripStepDto } from './dto/create-sequence.dto';
import { EnrollDto } from './dto/enroll.dto';

@Controller('sequences')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
export class SequencesController {
  constructor(private readonly service: SequencesService) {}

  // ── Sequences ────────────────────────────────────────────────────────────────

  @Get()
  list(@CurrentWorkspace() ws: Workspace) {
    return this.service.listSequences(ws.id);
  }

  @Get(':id')
  get(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getSequence(ws.id, id);
  }

  @Post()
  create(@CurrentWorkspace() ws: Workspace, @Body() dto: CreateSequenceDto) {
    return this.service.createSequence(ws.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateSequenceDto> & { status?: string },
  ) {
    return this.service.updateSequence(ws.id, id, dto as Parameters<SequencesService['updateSequence']>[2]);
  }

  @Delete(':id')
  remove(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deleteSequence(ws.id, id);
  }

  // ── Steps ────────────────────────────────────────────────────────────────────

  @Post(':id/steps')
  upsertStep(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Body() dto: CreateDripStepDto & { stepId?: string },
  ) {
    return this.service.upsertStep(ws.id, sequenceId, {
      id: dto.stepId,
      sortOrder: dto.sortOrder,
      delayDays: dto.delayDays,
      delayHours: dto.delayHours,
      message: dto.message,
      templateId: dto.templateId,
    });
  }

  @Delete(':id/steps/:stepId')
  deleteStep(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
  ) {
    return this.service.deleteStep(ws.id, sequenceId, stepId);
  }

  // ── Enrollments ──────────────────────────────────────────────────────────────

  @Post(':id/enroll')
  enroll(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) sequenceId: string,
    @Body() dto: EnrollDto,
  ) {
    return this.service.enroll(ws.id, sequenceId, dto);
  }

  @Delete(':id/enrollments/:eid')
  cancelEnrollment(
    @CurrentWorkspace() ws: Workspace,
    @Param('eid', ParseUUIDPipe) enrollmentId: string,
  ) {
    return this.service.cancelEnrollment(ws.id, enrollmentId);
  }

  @Get(':id/enrollments')
  listEnrollments(
    @CurrentWorkspace() ws: Workspace,
    @Param('id', ParseUUIDPipe) sequenceId: string,
  ) {
    return this.service.listEnrollments(ws.id, sequenceId);
  }
}
