import { Controller, Get, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { InstagramAccountsService } from './instagram-accounts.service';

@Controller('instagram')
@SkipThrottle()
export class InstagramWebhookController {
  constructor(
    private readonly service: InstagramAccountsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /instagram/callback
   * OAuth redirect target — Meta sends the auth code here after Instagram authorization.
   */
  @Public()
  @Get('callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    if (!code || !state) {
      return res.redirect(`${frontendUrl}/instagram-accounts?error=missing_params`);
    }
    const redirectUrl = await this.service.handleCallback(code, state);
    return res.redirect(redirectUrl);
  }
}
