import { ChannelType } from '@prisma/client';
import { ChannelRouterService } from './channel-router.service';

describe('ChannelRouterService', () => {
  it('sends Inbox replies through the connected Facebook Page and records the provider id', async () => {
    const prisma = {
      facebookPage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'page-db-id',
          pageId: '112808363955218',
          pageAccessToken: 'page-token',
        }),
      },
      inboxMessage: {
        create: jest.fn().mockResolvedValue({ id: 'message-id' }),
      },
      inboxThread: {
        update: jest.fn().mockResolvedValue({ id: 'thread-id' }),
      },
    };
    const fbPages = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 'outbound-mid' }),
    };
    const service = new ChannelRouterService(prisma as any, fbPages as any);

    await service.sendInboxReply(
      {
        threadId: 'thread-id',
        channel: ChannelType.MESSENGER,
        contactPhone: '',
        externalChatId: 'sender-id',
        whatsappAccountId: null,
        facebookPageId: 'page-db-id',
        telegramAccountId: null,
      },
      'Human reply',
    );

    expect(fbPages.sendMessage).toHaveBeenCalledWith(
      'page-token',
      'sender-id',
      'Human reply',
    );
    expect(prisma.inboxMessage.create).toHaveBeenCalledWith({
      data: {
        threadId: 'thread-id',
        direction: 'OUTBOUND',
        message: 'Human reply',
        providerMessageId: 'outbound-mid',
      },
    });
    expect(prisma.inboxThread.update).toHaveBeenCalledWith({
      where: { id: 'thread-id' },
      data: {
        lastMessagePreview: 'Human reply',
        lastMessageAt: expect.any(Date),
      },
    });
  });
});
