import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Permissions } from '../common/decorators/permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import type { Workspace } from '@prisma/client';
import { ChatbotAdminService } from './chatbot-admin.service';
import { CreateChatbotEdgeDto } from './dto/chatbot-edge.dto';
import { CreateChatbotNodeDto } from './dto/chatbot-node.dto';
import { CreateChatbotFlowDto } from './dto/create-flow.dto';
import { SetEntryNodeDto } from './dto/set-entry-node.dto';
import { SetFlowStatusDto } from './dto/set-flow-status.dto';
import { UpdateFlowGeometryDto } from './dto/update-flow-geometry.dto';

@Controller('chatbot/flows')
@UseGuards(WorkspaceContextGuard, RolesGuard, PermissionsGuard)
@Roles('owner', 'admin', 'agent')
@Permissions('manage_chatbot')
export class ChatbotAdminController {
  constructor(private readonly admin: ChatbotAdminService) {}

  @Get()
  list(@CurrentWorkspace() workspace: Workspace) {
    return this.admin.list(workspace.id);
  }

  @Put(':id/geometry')
  updateGeometry(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFlowGeometryDto,
  ) {
    return this.admin.updateGeometry(workspace.id, id, dto);
  }

  @Delete(':id/nodes/:nodeId')
  deleteNode(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
  ) {
    return this.admin.removeNode(workspace.id, id, nodeId);
  }

  @Delete(':id/edges/:edgeId')
  deleteEdge(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('edgeId', ParseUUIDPipe) edgeId: string,
  ) {
    return this.admin.removeEdge(workspace.id, id, edgeId);
  }

  @Get(':id')
  getOne(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.getById(workspace.id, id);
  }

  @Post()
  create(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: CreateChatbotFlowDto,
  ) {
    return this.admin.createFlow(workspace.id, dto.name);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetFlowStatusDto,
  ) {
    return this.admin.setStatus(workspace.id, id, dto.status);
  }

  @Patch(':id/entry')
  setEntry(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetEntryNodeDto,
  ) {
    return this.admin.setEntryNode(workspace.id, id, dto.entryNodeId);
  }

  @Post(':id/nodes')
  addNode(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChatbotNodeDto,
  ) {
    return this.admin.addNode(workspace.id, id, {
      type: dto.type,
      content: dto.content as any,
      position: dto.position as any,
    });
  }

  @Post(':id/edges')
  addEdge(
    @CurrentWorkspace() workspace: Workspace,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChatbotEdgeDto,
  ) {
    return this.admin.addEdge(workspace.id, id, {
      fromNodeId: dto.fromNodeId,
      toNodeId: dto.toNodeId,
      condition: dto.condition as any,
    });
  }
}
