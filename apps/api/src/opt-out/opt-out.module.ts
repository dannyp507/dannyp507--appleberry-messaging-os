import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OPT_OUT_DELETE_QUEUE } from '../queue/queue.constants';
import { OptOutDeleteProcessor } from './opt-out-delete.processor';
import { OptOutService } from './opt-out.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: OPT_OUT_DELETE_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
  ],
  providers: [OptOutService, OptOutDeleteProcessor],
  exports: [OptOutService],
})
export class OptOutModule {}
