import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BrandSettingsController } from './brand-settings.controller';
import { BrandSettingsService } from './brand-settings.service';

@Module({
  imports: [CommonModule],
  controllers: [BrandSettingsController],
  providers: [BrandSettingsService],
  exports: [BrandSettingsService],
})
export class BrandSettingsModule {}
