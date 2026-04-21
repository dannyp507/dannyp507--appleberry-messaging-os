import { Controller, Get, Headers, Post, Body, Query, RawBody, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
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
   * Receives all Messenger events for the app.
   * Verifies X-Hub-Signature-256 HMAC before processing.
   * Must respond 200 within 20 s — processing is fire-and-forget.
   */
  @Public()
  @Post('webhook')
  receiveWebhook(
    @Body() payload: FacebookWebhookPayload,
    @RawBody() rawBody: Buffer,
    @Headers('x-hub-signature-256') sig: string | undefined,
    @Res() res: Response,
  ) {
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET') ?? '';

    // Verify HMAC signature when app secret is configured
    if (appSecret) {
      if (!sig) {
        res.status(403).send('Missing signature');
        return;
      }
      const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
      const sigBuf = Buffer.from(sig);
      const expBuf = Buffer.from(expected);
      // Guard against length mismatch before timingSafeEqual
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        this.inbound['logger'].warn('Facebook webhook: invalid signature — request rejected');
        res.status(403).send('Forbidden');
        return;
      }
    }

    // Respond immediately — Meta requires 200 within 20 s
    res.status(200).send('EVENT_RECEIVED');

    // Only handle Page/Messenger events — Instagram Messaging is not yet configured
    if (payload?.object === 'page') {
      void this.inbound.handleWebhook(payload);
    }
  }

  /**
   * GET /facebook/callback
   * OAuth redirect target — Meta sends the auth code here.
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
