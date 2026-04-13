import { Module } from '@nestjs/common';
import { BaileysSessionService } from './baileys-session.service';

@Module({
  providers: [BaileysSessionService],
  exports: [BaileysSessionService],
})
export class BaileysModule {}
