import { Module } from '@nestjs/common';
import { PayfastService } from './payfast.service';
import { PayfastController } from './payfast.controller';

@Module({
  controllers: [PayfastController],
  providers: [PayfastService],
  exports: [PayfastService],
})
export class PayfastModule {}
