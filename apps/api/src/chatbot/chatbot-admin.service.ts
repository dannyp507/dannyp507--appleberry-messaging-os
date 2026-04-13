import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatbotFlowStatus, ChatbotNodeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import type { UpdateFlowGeometryDto } from './dto/update-flow-geometry.dto';

@Injectable()
export class ChatbotAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  list(workspaceId: string) {
    return this.prisma.chatbotFlow.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { nodes: true, edges: true } },
      },
    });
  }

  async getById(workspaceId: string, flowId: string) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
      include: { nodes: true, edges: true },
    });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
    return flow;
  }

  async createFlow(workspaceId: string, name: string) {
    await this.billing.assertCanCreateChatbotFlow(workspaceId);
    return this.prisma.chatbotFlow.create({
      data: { workspaceId, name, status: ChatbotFlowStatus.DRAFT },
    });
  }

  async setStatus(workspaceId: string, flowId: string, status: ChatbotFlowStatus) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return this.prisma.chatbotFlow.update({
      where: { id: flowId },
      data: { status },
    });
  }

  async setEntryNode(workspaceId: string, flowId: string, nodeId: string) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    const node = await this.prisma.chatbotNode.findFirst({
      where: { id: nodeId, flowId },
    });
    if (!node) throw new NotFoundException('Node not in flow');
    return this.prisma.chatbotFlow.update({
      where: { id: flowId },
      data: { entryNodeId: nodeId },
    });
  }

  async addNode(
    workspaceId: string,
    flowId: string,
    body: {
      type: ChatbotNodeType;
      content?: Prisma.InputJsonValue;
      position?: Prisma.InputJsonValue;
    },
  ) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    return this.prisma.chatbotNode.create({
      data: {
        flowId,
        type: body.type,
        content: body.content ?? {},
        position: body.position ?? {},
      },
    });
  }

  async addEdge(
    workspaceId: string,
    flowId: string,
    body: { fromNodeId: string; toNodeId: string; condition?: Prisma.InputJsonValue },
  ) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
    });
    if (!flow) throw new NotFoundException('Flow not found');
    const [from, to] = await Promise.all([
      this.prisma.chatbotNode.findFirst({ where: { id: body.fromNodeId, flowId } }),
      this.prisma.chatbotNode.findFirst({ where: { id: body.toNodeId, flowId } }),
    ]);
    if (!from || !to) {
      throw new BadRequestException('Nodes must belong to the flow');
    }
    return this.prisma.chatbotEdge.create({
      data: {
        flowId,
        fromNodeId: body.fromNodeId,
        toNodeId: body.toNodeId,
        condition:
          body.condition === undefined ? undefined : (body.condition as Prisma.InputJsonValue),
      },
    });
  }

  async updateGeometry(
    workspaceId: string,
    flowId: string,
    dto: UpdateFlowGeometryDto,
  ) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
    });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
    let updated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const n of dto.nodes) {
        const r = await tx.chatbotNode.updateMany({
          where: { id: n.id, flowId },
          data: {
            position: {
              x: n.position.x,
              y: n.position.y,
            } as Prisma.InputJsonValue,
          },
        });
        updated += r.count;
      }
    });
    return { updated };
  }

  async removeNode(workspaceId: string, flowId: string, nodeId: string) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
    });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
    const node = await this.prisma.chatbotNode.findFirst({
      where: { id: nodeId, flowId },
    });
    if (!node) {
      throw new NotFoundException('Node not found');
    }
    if (flow.entryNodeId === nodeId) {
      await this.prisma.chatbotFlow.update({
        where: { id: flowId },
        data: { entryNodeId: null },
      });
    }
    await this.prisma.chatbotNode.delete({ where: { id: nodeId } });
    return { deleted: true };
  }

  async removeEdge(workspaceId: string, flowId: string, edgeId: string) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
    });
    if (!flow) {
      throw new NotFoundException('Flow not found');
    }
    const edge = await this.prisma.chatbotEdge.findFirst({
      where: { id: edgeId, flowId },
    });
    if (!edge) {
      throw new NotFoundException('Edge not found');
    }
    await this.prisma.chatbotEdge.delete({ where: { id: edgeId } });
    return { deleted: true };
  }
}
