import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CommonModule } from '../common/common.module';
import { DRIP_SEQUENCES_QUEUE, MESSAGES_SEND_QUEUE } from '../queue/queue.constants';
import { SequencesController } from './sequences.controller';
import { SequencesService } from './sequences.service';
import { DripSequenceProcessor } from './drip-sequence.processor';

@Module({
  imports: [
    CommonModule,
    BullModule.registerQueue({ name: DRIP_SEQUENCES_QUEUE }),
    BullModule.registerQueue({ name: MESSAGES_SEND_QUEUE }),
  ],
  controllers: [SequencesController],
  providers: [SequencesService, DripSequenceProcessor],
  exports: [SequencesService],
})
export class SequencesModule {}
