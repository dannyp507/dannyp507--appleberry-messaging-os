import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatbotFlowStatus, ChatbotNodeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

// ── External flow JSON schema (as exported by most WA chatbot platforms) ──────

interface ExternalBot {
  name: string;
  keywords: string;
  type_search: string; // "1" = word match, "2" = contains
  template: string;
  type: string;        // "1" = text
  caption: string;
  media: string | null;
  run: string;
  sent: string | null;
  send_to: string;
  status: string;
  presenceTime: string;
  presenceType: string;
  nextBot: string;
  description: string;
  inputname: string;
  save_data: string;   // "2" = save to variable
  get_api_data: string;// "2" = call API
  api_url: string;
  api_config: string;
  use_ai: string;      // "1" = AI node
  is_default: string;  // "1" = fallback
}

export interface ExternalFlowJson {
  version: string;
  chatbots: ExternalBot[];
  templates: unknown[];
}

// ── Native Appleberry flow JSON (v2) — supports all node types ────────────────

interface NativeFlowNode {
  key: string;                     // unique key within this file (used for edges)
  label?: string;                  // display name for the node
  type: string;                    // ChatbotNodeType string
  content: Record<string, unknown>;
  position?: { x: number; y: number };
}

interface NativeFlowEdge {
  from: string;                    // key of source node
  to: string;                      // key of target node
  condition?: string;              // condition value (for CONDITION node outgoing edges)
}

interface NativeFlowJson {
  _format: 'appleberry-flow-v2';
  name?: string;
  entryKey?: string;
  nodes: NativeFlowNode[];
  edges: NativeFlowEdge[];
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ChatbotFlowIoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // ── IMPORT ────────────────────────────────────────────────────────────────

  async importFlow(
    workspaceId: string,
    name: string,
    payload: ExternalFlowJson | NativeFlowJson | Record<string, unknown>,
  ) {
    // Detect native Appleberry v2 format
    if ((payload as NativeFlowJson)._format === 'appleberry-flow-v2') {
      return this.importNativeFlow(workspaceId, name, payload as NativeFlowJson);
    }

    const chatbots = (payload as ExternalFlowJson)?.chatbots;
    if (!Array.isArray(chatbots) || chatbots.length === 0) {
      throw new BadRequestException(
        'Invalid file: no chatbot nodes found. Expected { chatbots: [...] } or { _format: "appleberry-flow-v2", nodes: [...] }',
      );
    }

    await this.billing.assertCanCreateChatbotFlow(workspaceId);

    const flow = await this.prisma.chatbotFlow.create({
      data: { workspaceId, name, status: ChatbotFlowStatus.DRAFT },
    });

    // First pass: create nodes and build keyword → nodeId index
    const keywordToNodeId = new Map<string, string>();
    const nodeIds: string[] = [];
    const nodeNextBots: string[] = [];
    let entryNodeId: string | null = null;

    for (let i = 0; i < chatbots.length; i++) {
      const bot = chatbots[i];

      const nodeType = this.resolveNodeType(bot);

      let apiConfig: unknown = {};
      try { apiConfig = JSON.parse(bot.api_config || '{}'); } catch { /* ignore */ }

      const content: Record<string, unknown> = {
        message: bot.caption ?? '',
        keywords: bot.keywords
          ? bot.keywords.split(',').map((k) => k.trim()).filter(Boolean)
          : [],
        matchType: bot.type_search === '2' ? 'contains' : 'word',
        description: bot.description ?? '',
        isDefault: bot.is_default === '1',
      };
      if (bot.inputname) content.inputName = bot.inputname;
      if (bot.media) content.mediaUrl = bot.media;
      if (bot.api_url) {
        content.webhookUrl = bot.api_url;
        content.webhookConfig = apiConfig;
      }
      if (bot.presenceTime && bot.presenceTime !== '0') {
        content.typingDelay = parseInt(bot.presenceTime, 10);
      }

      // Auto-layout: 4-column grid
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 60 + col * 280;
      const y = 60 + row * 180;

      const node = await this.prisma.chatbotNode.create({
        data: {
          flowId: flow.id,
          type: nodeType,
          content: content as Prisma.InputJsonValue,
          position: { x, y } as Prisma.InputJsonValue,
        },
      });

      nodeIds.push(node.id);
      nodeNextBots.push(bot.nextBot ?? '');

      // Index every keyword → this node
      if (bot.keywords) {
        bot.keywords
          .split(',')
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean)
          .forEach((kw) => {
            if (!keywordToNodeId.has(kw)) keywordToNodeId.set(kw, node.id);
          });
      }

      // Determine entry node: "start" keyword wins, then first is_default, then first node
      if (!entryNodeId) {
        const kwLower = (bot.keywords ?? '').toLowerCase();
        if (kwLower.includes('start') || kwLower.includes('hi') || kwLower.includes('hello')) {
          entryNodeId = node.id;
        }
      }
    }

    if (!entryNodeId) entryNodeId = nodeIds[0] ?? null;

    // Second pass: create edges from nextBot references
    for (let i = 0; i < nodeIds.length; i++) {
      const nextBot = nodeNextBots[i];
      if (!nextBot) continue;

      const candidates = nextBot
        .toLowerCase()
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      let targetId: string | undefined;
      for (const kw of candidates) {
        if (keywordToNodeId.has(kw)) {
          targetId = keywordToNodeId.get(kw);
          break;
        }
      }

      if (targetId && targetId !== nodeIds[i]) {
        await this.prisma.chatbotEdge
          .create({
            data: { flowId: flow.id, fromNodeId: nodeIds[i], toNodeId: targetId },
          })
          .catch(() => {/* skip duplicate edges */});
      }
    }

    if (entryNodeId) {
      await this.prisma.chatbotFlow.update({
        where: { id: flow.id },
        data: { entryNodeId },
      });
    }

    return this.prisma.chatbotFlow.findFirst({
      where: { id: flow.id },
      include: {
        nodes: true,
        edges: true,
        _count: { select: { nodes: true, edges: true } },
      },
    });
  }

  // ── IMPORT NATIVE (appleberry-flow-v2) ───────────────────────────────────

  private async importNativeFlow(
    workspaceId: string,
    name: string,
    payload: NativeFlowJson,
  ) {
    const nodes = payload.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      throw new BadRequestException('Native flow has no nodes');
    }

    await this.billing.assertCanCreateChatbotFlow(workspaceId);

    const flowName = name?.trim().length >= 2 ? name.trim() : (payload.name ?? 'Imported Flow');
    const flow = await this.prisma.chatbotFlow.create({
      data: { workspaceId, name: flowName, status: ChatbotFlowStatus.DRAFT },
    });

    // First pass: create all nodes, build key → db id map
    const keyToId = new Map<string, string>();

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const nodeType = Object.values(ChatbotNodeType).includes(n.type as ChatbotNodeType)
        ? (n.type as ChatbotNodeType)
        : ChatbotNodeType.TEXT;

      const col = i % 4;
      const row = Math.floor(i / 4);
      const pos = n.position ?? { x: 60 + col * 280, y: 60 + row * 180 };

      const created = await this.prisma.chatbotNode.create({
        data: {
          flowId: flow.id,
          type: nodeType,
          content: n.content as Prisma.InputJsonValue,
          position: pos as Prisma.InputJsonValue,
          label: n.label ?? undefined,
        },
      });
      keyToId.set(n.key, created.id);
    }

    // Second pass: create edges
    for (const e of payload.edges ?? []) {
      const fromId = keyToId.get(e.from);
      const toId   = keyToId.get(e.to);
      if (!fromId || !toId) continue;
      await this.prisma.chatbotEdge
        .create({
          data: {
            flowId: flow.id,
            fromNodeId: fromId,
            toNodeId: toId,
            // condition is { equals: "value" } JSON — engine checks e.condition?.equals
            ...(e.condition ? { condition: { equals: e.condition } as Prisma.InputJsonValue } : {}),
          },
        })
        .catch(() => {/* skip duplicates */});
    }

    // Set entry node
    const entryId = payload.entryKey
      ? keyToId.get(payload.entryKey)
      : keyToId.get(nodes[0]?.key ?? '');

    if (entryId) {
      await this.prisma.chatbotFlow.update({
        where: { id: flow.id },
        data: { entryNodeId: entryId },
      });
    }

    return this.prisma.chatbotFlow.findFirst({
      where: { id: flow.id },
      include: {
        nodes: true,
        edges: true,
        _count: { select: { nodes: true, edges: true } },
      },
    });
  }

  // ── EXPORT ────────────────────────────────────────────────────────────────

  async exportFlow(workspaceId: string, flowId: string): Promise<ExternalFlowJson> {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: { id: flowId, workspaceId },
      include: { nodes: true, edges: true },
    });
    if (!flow) throw new NotFoundException('Flow not found');

    // Build outgoing edge map and nodeId → first keyword map
    const outEdges = new Map<string, string[]>();
    for (const e of flow.edges) {
      const list = outEdges.get(e.fromNodeId) ?? [];
      list.push(e.toNodeId);
      outEdges.set(e.fromNodeId, list);
    }

    const nodeFirstKeyword = new Map<string, string>();
    for (const n of flow.nodes) {
      const c = n.content as Record<string, unknown>;
      const kws = c.keywords as string[] | undefined;
      if (kws && kws.length > 0) nodeFirstKeyword.set(n.id, kws[0]);
    }

    const chatbots: ExternalBot[] = flow.nodes.map((node, i) => {
      const c = node.content as Record<string, unknown>;
      const keywords = (c.keywords as string[] | undefined) ?? [];
      const targets = outEdges.get(node.id) ?? [];
      const nextBot = targets
        .map((id) => nodeFirstKeyword.get(id))
        .filter(Boolean)
        .join(',');

      let apiConfig = '{"method":"get"}';
      if (c.webhookConfig) {
        try { apiConfig = JSON.stringify(c.webhookConfig); } catch { /* ignore */ }
      }

      return {
        name: (c.description as string) || `${node.type}_${i + 1}`,
        keywords: keywords.join(','),
        type_search: (c.matchType as string) === 'contains' ? '2' : '1',
        template: '0',
        type: '1',
        caption: (c.message as string) ?? '',
        media: (c.mediaUrl as string | undefined) ?? null,
        run: '1',
        sent: null,
        send_to: '1',
        status: '1',
        presenceTime: String(c.typingDelay ?? 0),
        presenceType: '0',
        nextBot,
        description: (c.description as string) ?? '',
        inputname: (c.inputName as string) ?? '',
        save_data: node.type === ChatbotNodeType.SAVE_ANSWER ? '2' : '1',
        get_api_data: node.type === ChatbotNodeType.WEBHOOK ? '2' : '1',
        api_url: (c.webhookUrl as string) ?? '',
        api_config: apiConfig,
        use_ai: node.type === ChatbotNodeType.AI_REPLY ? '1' : '0',
        is_default: (c.isDefault as boolean) ? '1' : '0',
      };
    });

    return { version: '8.0.0', chatbots, templates: [] };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolveNodeType(bot: ExternalBot): ChatbotNodeType {
    if (bot.use_ai === '1') return ChatbotNodeType.AI_REPLY;
    if (bot.get_api_data === '2' && bot.api_url) return ChatbotNodeType.WEBHOOK;
    if (bot.save_data === '2' && bot.inputname) return ChatbotNodeType.SAVE_ANSWER;
    if (bot.media) return ChatbotNodeType.MEDIA;
    const kw = (bot.keywords ?? '').toLowerCase();
    if (kw.includes('human') || kw.includes('agent')) return ChatbotNodeType.HUMAN_HANDOFF;
    if (bot.nextBot === 'OFF' || bot.caption === 'OFF') return ChatbotNodeType.END;
    return ChatbotNodeType.TEXT;
  }
}
