import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { MessagesModule } from '../messages/messages.module';
import { SequencesModule } from '../sequences/sequences.module';
import { SubscribeFormsController } from './subscribe-forms.controller';
import { PublicFormsController } from './public-forms.controller';
import { SubscribeFormsService } from './subscribe-forms.service';

@Module({
  imports: [CommonModule, MessagesModule, SequencesModule],
  controllers: [SubscribeFormsController, PublicFormsController],
  providers: [SubscribeFormsService],
})
export class SubscribeFormsModule {}
