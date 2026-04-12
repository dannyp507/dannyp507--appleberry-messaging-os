import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IncomingMessageService } from '../inbound/incoming-message.service';
import { INCOMING_MESSAGES_QUEUE, type IncomingMessageJob } from './queue.constants';

@Processor(INCOMING_MESSAGES_QUEUE, { concurrency: 10 })
export class IncomingMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(IncomingMessageProcessor.name);

  constructor(private readonly incoming: IncomingMessageService) {
    super();
  }

  async process(job: Job<IncomingMessageJob, void, string>): Promise<void> {
    try {
      await this.incoming.dispatch(job.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Incoming dispatch failed: ${msg}`);
      throw err;
    }
  }
}
