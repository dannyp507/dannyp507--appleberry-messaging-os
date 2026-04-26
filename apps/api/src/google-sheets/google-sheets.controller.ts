import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Workspace } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { UpsertGoogleSheetsSettingsDto } from './dto/upsert-google-sheets-settings.dto';
import { GoogleSheetsService } from './google-sheets.service';

const GOOGLE_SHEETS_STATE_COOKIE = 'appleberry_google_sheets_state';
const GOOGLE_SHEETS_WORKSPACE_COOKIE = 'appleberry_google_sheets_workspace';

function shortLivedCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 10 * 60 * 1000,
    path: '/',
  };
}

function statesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

@Controller('google-sheets')
export class GoogleSheetsController {
  constructor(private readonly googleSheets: GoogleSheetsService) {}

  @Get('settings')
  getSettings(@CurrentWorkspace() workspace: Workspace) {
    return this.googleSheets.getSettings(workspace.id);
  }

  @Get('connect')
  connect(@CurrentWorkspace() workspace: Workspace, @Res() res: Response) {
    const state = randomBytes(32).toString('hex');
    res.cookie(GOOGLE_SHEETS_STATE_COOKIE, state, shortLivedCookieOptions());
    res.cookie(
      GOOGLE_SHEETS_WORKSPACE_COOKIE,
      workspace.id,
      shortLivedCookieOptions(),
    );
    return res.redirect(this.googleSheets.buildAuthorizationUrl(state));
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const expectedState = req.cookies?.[GOOGLE_SHEETS_STATE_COOKIE] as
      | string
      | undefined;
    const workspaceId = req.cookies?.[GOOGLE_SHEETS_WORKSPACE_COOKIE] as
      | string
      | undefined;

    res.clearCookie(GOOGLE_SHEETS_STATE_COOKIE, { path: '/' });
    res.clearCookie(GOOGLE_SHEETS_WORKSPACE_COOKIE, { path: '/' });

    if (
      !code?.trim() ||
      !state?.trim() ||
      !expectedState?.trim() ||
      !workspaceId?.trim()
    ) {
      throw new UnauthorizedException(
        'Invalid Google Sheets connection request',
      );
    }
    if (!statesMatch(expectedState, state)) {
      throw new UnauthorizedException('Invalid Google Sheets connection state');
    }

    const redirectUrl = await this.googleSheets.finishCallback(
      workspaceId,
      code,
    );
    return res.redirect(redirectUrl);
  }

  @Post('settings')
  updateSettings(
    @CurrentWorkspace() workspace: Workspace,
    @Body() dto: UpsertGoogleSheetsSettingsDto,
  ) {
    return this.googleSheets.updateSettings(workspace.id, dto);
  }

  @Post('disconnect')
  disconnect(
    @CurrentWorkspace() workspace: Workspace,
    @CurrentUser() user: AuthUser,
  ) {
    return this.googleSheets.disconnect(workspace.id, user.userId);
  }
}
