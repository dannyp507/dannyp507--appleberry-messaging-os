import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DRIP_SEQUENCES_QUEUE, type DripSequenceJob } from '../queue/queue.constants';
import { SequencesService } from './sequences.service';

@Processor(DRIP_SEQUENCES_QUEUE, { concurrency: 3 })
export class DripSequenceProcessor extends WorkerHost {
  private readonly logger = new Logger(DripSequenceProcessor.name);

  constructor(private readonly sequences: SequencesService) {
    super();
  }

  async process(job: Job<DripSequenceJob>): Promise<void> {
    this.logger.log(`Processing drip job for enrollment ${job.data.enrollmentId}`);
    await this.sequences.executeStep(job.data.enrollmentId);
  }
}
