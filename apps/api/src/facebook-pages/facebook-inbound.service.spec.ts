import { ChannelType, KeywordActionType } from '@prisma/client';
import { FacebookInboundService } from './facebook-inbound.service';

function buildService() {
  const prisma = {
    contact: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inboxThread: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    inboxMessage: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    autoresponderRule: {
      findMany: jest.fn(),
    },
    keywordTrigger: {
      findMany: jest.fn(),
    },
    template: {
      findFirst: jest.fn(),
    },
  };
  const fbPages = {
    findByPageId: jest.fn(),
    sendMessage: jest.fn(),
  };
  const templates = {
    interpolate: jest.fn(),
  };
  const googleSheets = {
    captureNewLead: jest.fn(),
  };

  const service = new FacebookInboundService(
    prisma as any,
    fbPages as any,
    templates as any,
    googleSheets as any,
  );
  return { service, prisma, fbPages, templates, googleSheets };
}

const page = {
  id: 'page-db-id',
  pageId: '112808363955218',
  workspaceId: 'workspace-id',
  pageAccessToken: 'page-token',
  name: 'Food Bru',
};

const contact = {
  id: 'contact-id',
  workspaceId: 'workspace-id',
  phone: 'messenger:sender-id',
  externalId: 'messenger:sender-id',
  firstName: 'Messenger',
  lastName: 'User',
};

const thread = {
  id: 'thread-id',
  workspaceId: 'workspace-id',
  contactId: 'contact-id',
  channel: ChannelType.MESSENGER,
  facebookPageId: 'page-db-id',
  externalChatId: 'sender-id',
};

const payload = {
  object: 'page' as const,
  entry: [
    {
      id: page.pageId,
      time: Date.now(),
      messaging: [
        {
          sender: { id: 'sender-id' },
          recipient: { id: page.pageId },
          timestamp: Date.now(),
          message: { mid: 'mid-1', text: 'hello' },
        },
      ],
    },
  ],
};

describe('FacebookInboundService', () => {
  it('creates a Messenger contact, thread, and inbound message for the connected page', async () => {
    const { service, prisma, fbPages, googleSheets } = buildService();
    fbPages.findByPageId.mockResolvedValue(page);
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue(contact);
    prisma.inboxThread.findFirst.mockResolvedValue(null);
    prisma.inboxThread.create.mockResolvedValue(thread);
    prisma.inboxMessage.create.mockResolvedValue({ id: 'message-id' });
    prisma.autoresponderRule.findMany.mockResolvedValue([]);
    prisma.keywordTrigger.findMany.mockResolvedValue([]);

    await service.handleWebhook(payload);

    expect(prisma.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: page.workspaceId,
        phone: 'messenger:sender-id',
        externalId: 'messenger:sender-id',
      }),
    });
    expect(prisma.inboxThread.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: page.workspaceId,
        contactId: contact.id,
        channel: ChannelType.MESSENGER,
        facebookPageId: page.id,
        externalChatId: 'sender-id',
        unreadCount: 1,
      }),
    });
    expect(prisma.inboxMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        threadId: thread.id,
        direction: 'INBOUND',
        message: 'hello',
        providerMessageId: 'mid-1',
      }),
    });
    expect(googleSheets.captureNewLead).toHaveBeenCalledWith({
      workspaceId: page.workspaceId,
      channel: ChannelType.MESSENGER,
      sourceName: page.name,
      contact,
      messageText: 'hello',
      threadId: thread.id,
    });
  });

  it('skips duplicate Messenger webhook events before updating unread state', async () => {
    const { service, prisma, fbPages } = buildService();
    fbPages.findByPageId.mockResolvedValue(page);
    prisma.contact.findFirst.mockResolvedValue(contact);
    prisma.inboxThread.findFirst.mockResolvedValue(thread);
    prisma.inboxMessage.findFirst.mockResolvedValue({ id: 'existing-message' });

    await service.handleWebhook(payload);

    expect(prisma.inboxThread.update).not.toHaveBeenCalled();
    expect(prisma.inboxMessage.create).not.toHaveBeenCalled();
    expect(prisma.autoresponderRule.findMany).not.toHaveBeenCalled();
    expect(prisma.keywordTrigger.findMany).not.toHaveBeenCalled();
  });

  it('runs page-scoped Messenger autoresponders and records the provider message id', async () => {
    const { service, prisma, fbPages } = buildService();
    fbPages.findByPageId.mockResolvedValue(page);
    fbPages.sendMessage.mockResolvedValue({ message_id: 'outbound-mid' });
    prisma.contact.findFirst.mockResolvedValue(contact);
    prisma.inboxThread.findFirst.mockResolvedValue(thread);
    prisma.inboxThread.update.mockResolvedValue(thread);
    prisma.inboxMessage.findFirst.mockResolvedValue(null);
    prisma.inboxMessage.create.mockResolvedValue({ id: 'message-id' });
    prisma.autoresponderRule.findMany.mockResolvedValue([
      {
        keyword: 'hello',
        matchType: 'EXACT',
        response: 'Hi from the page',
        name: 'Greeting',
      },
    ]);

    await service.handleWebhook(payload);

    expect(prisma.autoresponderRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: page.workspaceId,
          OR: [
            { facebookPageId: page.id },
            { facebookPageId: null, whatsappAccountId: null },
          ],
        }),
      }),
    );
    expect(fbPages.sendMessage).toHaveBeenCalledWith(
      page.pageAccessToken,
      'sender-id',
      'Hi from the page',
    );
    expect(prisma.inboxMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: 'OUTBOUND',
        message: 'Hi from the page',
        providerMessageId: 'outbound-mid',
      }),
    });
    expect(prisma.keywordTrigger.findMany).not.toHaveBeenCalled();
  });

  it('runs Messenger-scoped keyword triggers without crossing into WhatsApp-only rules', async () => {
    const { service, prisma, fbPages } = buildService();
    fbPages.findByPageId.mockResolvedValue(page);
    fbPages.sendMessage.mockResolvedValue({ message_id: 'keyword-mid' });
    prisma.contact.findFirst.mockResolvedValue(contact);
    prisma.inboxThread.findFirst.mockResolvedValue(thread);
    prisma.inboxThread.update.mockResolvedValue(thread);
    prisma.inboxMessage.findFirst.mockResolvedValue(null);
    prisma.inboxMessage.create.mockResolvedValue({ id: 'message-id' });
    prisma.autoresponderRule.findMany.mockResolvedValue([]);
    prisma.keywordTrigger.findMany.mockResolvedValue([
      {
        keyword: 'hello',
        matchType: 'EXACT',
        actionType: KeywordActionType.SEND_MESSAGE,
        response: 'Keyword reply',
      },
    ]);

    await service.handleWebhook(payload);

    expect(prisma.keywordTrigger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: page.workspaceId,
          OR: [{ channel: ChannelType.MESSENGER }, { channel: null }],
        }),
      }),
    );
    expect(fbPages.sendMessage).toHaveBeenCalledWith(
      page.pageAccessToken,
      'sender-id',
      'Keyword reply',
    );
  });
});
