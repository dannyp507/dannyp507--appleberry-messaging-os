import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ContactGroupsController } from './contact-groups.controller';
import { ContactGroupsService } from './contact-groups.service';

@Module({
  imports: [CommonModule],
  controllers: [ContactGroupsController],
  providers: [ContactGroupsService],
})
export class ContactGroupsModule {}
