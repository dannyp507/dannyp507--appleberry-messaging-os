import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Redirect,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Workspace } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { WorkspaceContextGuard } from '../common/guards/workspace-context.guard';
import { CurrentWorkspace } from '../common/decorators/current-workspace.decorator';
import { IntegrationsService } from './integrations.service';
import { UpsertSheetsConfigDto } from './dto/upsert-sheets-config.dto';
import { UpsertCalendarConfigDto } from './dto/upsert-calendar-config.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';

@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly svc: IntegrationsService,
    private readonly config: ConfigService,
  ) {}

  // ─── Google OAuth ─────────────────────────────────────────────────────────

  /** Returns the Google OAuth consent URL */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Get('google/auth-url')
  getAuthUrl(@CurrentWorkspace() ws: Workspace) {
    return { url: this.svc.getAuthUrl(ws.id) };
  }

  /**
   * OAuth2 callback — called by Google after user grants permission.
   * Public (no JWT guard) — Google redirects here directly.
   * Redirects browser to the frontend integrations page.
   */

  @Public()
  @Get("google/callback")
  @Redirect()
  async handleCallback(@Query('code') code: string, @Query('state') workspaceId: string) {
    const frontendUrl = this.config.get<string>(
      'FRONTEND_URL',
      'https://appleberry-app.duckdns.org',
    );
    try {
      await this.svc.handleCallback(code, workspaceId);
      return { url: `${frontendUrl}/settings/integrations?connected=google` };
    } catch (err) {
      this.logger.error('Google OAuth callback failed: ' + JSON.stringify({ msg: err?.message, code: err?.code, response: err?.response?.data }));
      return { url: `${frontendUrl}/settings/integrations?error=google_auth_failed` };
    }
  }

  /** Get Google connection status + sub-configs */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Get('google/status')
  getStatus(@CurrentWorkspace() ws: Workspace) {
    return this.svc.getStatus(ws.id);
  }

  /** Disconnect Google account */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Delete('google')
  disconnect(@CurrentWorkspace() ws: Workspace) {
    return this.svc.disconnect(ws.id);
  }

  // ─── Google Sheets ────────────────────────────────────────────────────────

  /** List the user's Google Spreadsheets */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Get('google-sheets/spreadsheets')
  listSpreadsheets(@CurrentWorkspace() ws: Workspace) {
    return this.svc.listSpreadsheets(ws.id);
  }

  /** List sheet tabs inside a spreadsheet */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Get('google-sheets/spreadsheets/:spreadsheetId/tabs')
  listTabs(
    @CurrentWorkspace() ws: Workspace,
    @Param('spreadsheetId') spreadsheetId: string,
  ) {
    return this.svc.listSheetTabs(ws.id, spreadsheetId);
  }

  /** Save / update sheet config */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Put('google-sheets/config')
  upsertSheetsConfig(
    @CurrentWorkspace() ws: Workspace,
    @Body() dto: UpsertSheetsConfigDto,
  ) {
    return this.svc.upsertSheetsConfig(ws.id, dto);
  }

  /** Append a test row to verify the connection */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Post('google-sheets/test')
  testSheet(@CurrentWorkspace() ws: Workspace) {
    return this.svc.testSheetConnection(ws.id);
  }

  // ─── Google Calendar ──────────────────────────────────────────────────────

  /** List the user's Google Calendars */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Get('google-calendar/calendars')
  listCalendars(@CurrentWorkspace() ws: Workspace) {
    return this.svc.listCalendars(ws.id);
  }

  /** Save / update calendar config */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Put('google-calendar/config')
  upsertCalendarConfig(
    @CurrentWorkspace() ws: Workspace,
    @Body() dto: UpsertCalendarConfigDto,
  ) {
    return this.svc.upsertCalendarConfig(ws.id, dto);
  }

  /** Check if a time slot is free */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Post('google-calendar/check-availability')
  checkAvailability(
    @CurrentWorkspace() ws: Workspace,
    @Body() dto: CheckAvailabilityDto,
  ) {
    return this.svc.checkAvailability(ws.id, dto);
  }

  /** Create a calendar booking */
  @UseGuards(JwtAuthGuard, WorkspaceContextGuard)
  @Post('google-calendar/book')
  createBooking(
    @CurrentWorkspace() ws: Workspace,
    @Body() dto: CreateBookingDto,
  ) {
    return this.svc.createBooking(ws.id, dto);
  }
}
