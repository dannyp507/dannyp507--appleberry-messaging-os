import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INCOMING_MESSAGES_QUEUE } from '../queue/queue.constants';
import { BaileysSessionService } from './baileys-session.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: INCOMING_MESSAGES_QUEUE }),
  ],
  providers: [BaileysSessionService],
  exports: [BaileysSessionService],
})
export class BaileysModule {}
