import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { FacebookPagesModule } from '../facebook-pages/facebook-pages.module';
import { ChannelRouterService } from './channel-router.service';

@Module({
  imports: [CommonModule, FacebookPagesModule],
  providers: [ChannelRouterService],
  exports: [ChannelRouterService],
})
export class ChannelsModule {}
