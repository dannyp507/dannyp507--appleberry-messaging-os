import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ChannelType, type Contact } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertGoogleSheetsSettingsDto } from './dto/upsert-google-sheets-settings.dto';

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email: string;
  name?: string;
};

type LeadCaptureInput = {
  workspaceId: string;
  channel: ChannelType;
  sourceName: string;
  contact: Contact;
  messageText: string;
  threadId: string;
};

type AppointmentSheetRowInput = {
  workspaceId: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  };
  serviceName: string;
  calendarId: string;
  eventId: string;
  startIso: string;
  endIso: string;
  status: string;
};

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get clientId() {
    return this.config.get<string>('GOOGLE_CLIENT_ID') ?? '';
  }

  private get clientSecret() {
    return this.config.get<string>('GOOGLE_CLIENT_SECRET') ?? '';
  }

  private get callbackUrl() {
    return (
      this.config.get<string>('GOOGLE_SHEETS_CALLBACK_URL') ??
      `${this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:3001'}/google-sheets/callback`
    );
  }

  private get webAppUrl() {
    return this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
  }

  async getSettings(workspaceId: string) {
    const row = await this.prisma.workspaceGoogleSheetsSettings.findUnique({
      where: { workspaceId },
    });

    return {
      connected: Boolean(row?.googleRefreshToken),
      googleEmail: row?.googleEmail ?? null,
      spreadsheetId: row?.spreadsheetId ?? '',
      sheetName: row?.sheetName ?? 'Leads',
      appointmentSheetName: row?.appointmentSheetName ?? 'Appointments',
      calendarId: row?.calendarId ?? '',
      appointmentDurationMins: row?.appointmentDurationMins ?? 60,
      enabled: row?.enabled ?? false,
      lastExportedAt: row?.lastExportedAt ?? null,
      lastError: row?.lastError ?? null,
    };
  }

  buildAuthorizationUrl(state: string) {
    if (!this.clientId.trim()) {
      throw new BadRequestException('Google Sheets is not configured');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/calendar',
      ].join(' '),
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async finishCallback(workspaceId: string, code: string) {
    const tokens = await this.exchangeCodeForTokens(code);
    const profile = await this.fetchUserInfo(tokens.access_token!);
    const existing = await this.prisma.workspaceGoogleSheetsSettings.findUnique(
      {
        where: { workspaceId },
      },
    );

    await this.prisma.workspaceGoogleSheetsSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        googleEmail: profile.email,
        googleRefreshToken: tokens.refresh_token ?? null,
        enabled: false,
        sheetName: existing?.sheetName ?? 'Leads',
        appointmentSheetName: existing?.appointmentSheetName ?? 'Appointments',
        calendarId: existing?.calendarId ?? null,
        appointmentDurationMins: existing?.appointmentDurationMins ?? 60,
      },
      update: {
        googleEmail: profile.email,
        googleRefreshToken:
          tokens.refresh_token ?? existing?.googleRefreshToken ?? null,
        lastError: null,
      },
    });

    const redirectUrl = new URL('/settings/google-sheets', this.webAppUrl);
    redirectUrl.searchParams.set('connected', '1');
    return redirectUrl.toString();
  }

  async updateSettings(
    workspaceId: string,
    dto: UpsertGoogleSheetsSettingsDto,
  ) {
    const existing = await this.prisma.workspaceGoogleSheetsSettings.findUnique(
      {
        where: { workspaceId },
      },
    );

    if (dto.enabled && !existing?.googleRefreshToken) {
      throw new BadRequestException(
        'Connect Google Sheets before enabling exports',
      );
    }

    const row = await this.prisma.workspaceGoogleSheetsSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        spreadsheetId: dto.spreadsheetId?.trim() || null,
        sheetName: dto.sheetName?.trim() || 'Leads',
        appointmentSheetName:
          dto.appointmentSheetName?.trim() || 'Appointments',
        calendarId: dto.calendarId?.trim() || null,
        appointmentDurationMins: dto.appointmentDurationMins ?? 60,
        enabled: dto.enabled ?? false,
      },
      update: {
        spreadsheetId:
          dto.spreadsheetId === undefined
            ? undefined
            : dto.spreadsheetId.trim() || null,
        sheetName:
          dto.sheetName === undefined
            ? undefined
            : dto.sheetName.trim() || 'Leads',
        appointmentSheetName:
          dto.appointmentSheetName === undefined
            ? undefined
            : dto.appointmentSheetName.trim() || 'Appointments',
        calendarId:
          dto.calendarId === undefined
            ? undefined
            : dto.calendarId.trim() || null,
        appointmentDurationMins:
          dto.appointmentDurationMins === undefined
            ? undefined
            : dto.appointmentDurationMins,
        enabled: dto.enabled ?? undefined,
      },
    });

    return {
      connected: Boolean(row.googleRefreshToken),
      googleEmail: row.googleEmail ?? null,
      spreadsheetId: row.spreadsheetId ?? '',
      sheetName: row.sheetName ?? 'Leads',
      appointmentSheetName: row.appointmentSheetName ?? 'Appointments',
      calendarId: row.calendarId ?? '',
      appointmentDurationMins: row.appointmentDurationMins ?? 60,
      enabled: row.enabled,
      lastExportedAt: row.lastExportedAt ?? null,
      lastError: row.lastError ?? null,
    };
  }

  async disconnect(workspaceId: string, _userId: string) {
    await this.prisma.workspaceGoogleSheetsSettings.deleteMany({
      where: { workspaceId },
    });
    return { disconnected: true as const };
  }

  async captureNewLead(input: LeadCaptureInput) {
    const settings = await this.getConnectionSettings(input.workspaceId);
    if (
      !settings?.enabled ||
      !settings.googleRefreshToken ||
      !settings.spreadsheetId ||
      !settings.sheetName
    ) {
      return;
    }

    try {
      await this.appendRow(input.workspaceId, settings.sheetName, [
        new Date().toISOString(),
        input.channel,
        input.sourceName,
        `${input.contact.firstName} ${input.contact.lastName}`.trim(),
        input.contact.phone,
        input.contact.email ?? '',
        input.messageText,
        input.threadId,
        input.contact.id,
      ]);

      await this.prisma.workspaceGoogleSheetsSettings.update({
        where: { workspaceId: input.workspaceId },
        data: { lastExportedAt: new Date(), lastError: null },
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unknown Google Sheets export error';
      this.logger.error(
        `Lead export failed for workspace=${input.workspaceId}: ${message}`,
      );
      await this.prisma.workspaceGoogleSheetsSettings.updateMany({
        where: { workspaceId: input.workspaceId },
        data: { lastError: message.slice(0, 2000) },
      });
    }
  }

  async captureAppointmentRow(input: AppointmentSheetRowInput) {
    const settings = await this.getConnectionSettings(input.workspaceId);
    if (!settings?.enabled || !settings.spreadsheetId) {
      return;
    }

    await this.appendRow(
      input.workspaceId,
      settings.appointmentSheetName ?? 'Appointments',
      [
        new Date().toISOString(),
        input.status,
        input.serviceName,
        `${input.contact.firstName} ${input.contact.lastName}`.trim(),
        input.contact.phone,
        input.contact.email ?? '',
        input.startIso,
        input.endIso,
        input.calendarId,
        input.eventId,
        input.contact.id,
      ],
    );
  }

  async getConnectionSettings(workspaceId: string) {
    return this.prisma.workspaceGoogleSheetsSettings.findUnique({
      where: { workspaceId },
    });
  }

  async getWorkspaceAccessToken(workspaceId: string) {
    const settings = await this.getConnectionSettings(workspaceId);
    if (!settings?.googleRefreshToken) {
      return null;
    }
    return this.refreshAccessToken(settings.googleRefreshToken);
  }

  async appendRow(workspaceId: string, sheetName: string, values: unknown[]) {
    const settings = await this.getConnectionSettings(workspaceId);
    if (!settings?.spreadsheetId) {
      throw new BadRequestException(
        'Google Sheets spreadsheet is not configured',
      );
    }

    const accessToken = await this.getWorkspaceAccessToken(workspaceId);
    if (!accessToken) {
      throw new BadRequestException('Google Sheets is not connected');
    }

    const range = `${sheetName}!A:Z`;
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        settings.spreadsheetId,
      )}/values/${encodeURIComponent(
        range,
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ values: [values] }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        body || `Google Sheets append failed with HTTP ${res.status}`,
      );
    }
  }

  private async exchangeCodeForTokens(code: string) {
    if (!this.clientId.trim() || !this.clientSecret.trim()) {
      throw new BadRequestException('Google Sheets is not configured');
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    const tokenJson = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new BadRequestException(
        tokenJson.error_description ?? 'Google Sheets token exchange failed',
      );
    }

    return tokenJson;
  }

  private async refreshAccessToken(refreshToken: string) {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokenJson = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new BadRequestException(
        tokenJson.error_description ?? 'Google Sheets token refresh failed',
      );
    }

    return tokenJson.access_token;
  }

  private async fetchUserInfo(accessToken: string) {
    const profileResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!profileResponse.ok) {
      throw new BadRequestException('Google Sheets profile lookup failed');
    }

    return (await profileResponse.json()) as GoogleUserInfo;
  }
}
