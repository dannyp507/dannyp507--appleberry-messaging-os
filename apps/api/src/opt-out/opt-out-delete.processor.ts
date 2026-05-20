import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { OPT_OUT_DELETE_QUEUE } from '../queue/queue.constants';

@Processor(OPT_OUT_DELETE_QUEUE)
export class OptOutDeleteProcessor extends WorkerHost {
  private readonly logger = new Logger(OptOutDeleteProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ contactId: string }>): Promise<void> {
    const { contactId } = job.data;
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, optOut: true },
    });
    if (!contact) return;
    if (!contact.optOut) {
      this.logger.log(`Contact ${contactId} re-subscribed before deletion window — skipping`);
      return;
    }
    await this.prisma.contact.delete({ where: { id: contactId } });
    this.logger.log(`Deleted opted-out contact ${contactId} after 7-day window`);
  }
}
