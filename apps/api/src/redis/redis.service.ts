import {
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(this.config.get<string>('REDIS_PORT', '6379')),
      maxRetriesPerRequest: null,
    });
  }

  get redis(): Redis {
    return this.client;
  }

  /**
   * Fixed-window per-minute counter per WhatsApp account.
   * Waits until the next window if the limit is exceeded.
   */
  async throttleWhatsappAccount(
    accountId: string,
    maxPerMinute: number,
  ): Promise<void> {
    if (maxPerMinute <= 0) {
      return;
    }

    for (;;) {
      const window = Math.floor(Date.now() / 60000);
      const key = `rl:wa:${accountId}:${window}`;
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, 120);
      }
      if (count <= maxPerMinute) {
        return;
      }
      await this.client.decr(key);
      const msIntoMinute = Date.now() % 60000;
      const wait = Math.max(60000 - msIntoMinute, 250);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
