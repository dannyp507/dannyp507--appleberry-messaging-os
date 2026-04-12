import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return {
      ok: true,
      service: 'appleberry-api',
      docs: 'Use POST /auth/register and POST /auth/login; most routes require Authorization: Bearer <token>.',
    };
  }
}
