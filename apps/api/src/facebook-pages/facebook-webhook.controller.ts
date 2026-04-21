import { Controller, Get, Post, Body, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { FacebookInboundService, FacebookWebhookPayload } from './facebook-inbound.service';
import { FacebookPagesService } from './facebook-pages.service';

@Controller('facebook')
@SkipThrottle()
export class FacebookWebhookController {
  constructor(
    private readonly inbound: FacebookInboundService,
    private readonly fbService: FacebookPagesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /facebook/webhook
   * Meta calls this to verify the webhook endpoint.
   * Set FACEBOOK_WEBHOOK_VERIFY_TOKEN to any secret string, then use
   * the same value in the Meta App Dashboard → Webhooks → Verify Token.
   */
  @Public()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = this.config.get<string>('FACEBOOK_WEBHOOK_VERIFY_TOKEN') ?? '';
    if (mode === 'subscribe' && verifyToken === expected) {
      this.inbound['logger'].log('Facebook webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  /**
   * POST /facebook/webhook
   * Receives all Messenger (and Instagram) events for the app.
   * Must respond with 200 within 20 s — processing is fire-and-forget.
   */
  @Public()
  @Post('webhook')
  receiveWebhook(@Body() payload: FacebookWebhookPayload, @Res() res: Response) {
    res.status(200).send('EVENT_RECEIVED');
    if (payload?.object === 'page' || payload?.object === 'instagram') {
      void this.inbound.handleWebhook(payload);
    }
  }

  /**
   * GET /facebook/callback
   * OAuth redirect target — Meta sends the auth code here.
   * Exchanges the code, saves pages, then redirects back to the frontend.
   */
  @Public()
  @Get('callback')
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code || !state) {
      const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/facebook-pages?error=missing_params`);
    }
    const redirectUrl = await this.fbService.handleCallback(code, state);
    return res.redirect(redirectUrl);
  }
}
