import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertSheetsConfigDto } from './dto/upsert-sheets-config.dto';
import { UpsertCalendarConfigDto } from './dto/upsert-calendar-config.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

// ─── Field display names for auto-creating sheet headers ─────────────────────
const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  phone: 'Phone',
  email: 'Email',
  source: 'Source',
  notes: 'Notes',
  service: 'Service',
  timestamp: 'Timestamp',
};

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─── OAuth client factory ────────────────────────────────────────────────

  private createOAuthClient(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  /** Build the Google consent URL with offline access */
  getAuthUrl(workspaceId: string): string {
    const client = this.createOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/calendar',
      ],
      state: workspaceId,
    });
  }

  /** Exchange auth code for tokens and persist them */
  async handleCallback(code: string, workspaceId: string): Promise<void> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      throw new BadRequestException(
        'No refresh token returned — ensure you revoke and re-authorize.',
      );
    }

    client.setCredentials(tokens);

    // Fetch the Google account email
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    const email = data.email ?? '';

    await this.prisma.googleIntegration.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        email,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiry: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
      },
      update: {
        email,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiry: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
      },
    });
  }

  /** Get the Google connection status for a workspace */
  async getStatus(workspaceId: string) {
    const integration = await this.prisma.googleIntegration.findUnique({
      where: { workspaceId },
    });

    if (!integration) return { connected: false };

    // LeadCaptureConfig and CalendarConfig are tied to the Workspace, not GoogleIntegration
    const [sheetsConfig, calendarConfig] = await Promise.all([
      this.prisma.leadCaptureConfig.findUnique({ where: { workspaceId } }),
      this.prisma.calendarConfig.findUnique({ where: { workspaceId } }),
    ]);

    return {
      connected: true,
      email: integration.email,
      hasSheets: !!sheetsConfig,
      hasCalendar: !!calendarConfig,
      sheetsConfig,
      calendarConfig,
    };
  }

  /** Disconnect Google — removes all integration data */
  async disconnect(workspaceId: string): Promise<void> {
    await this.prisma.googleIntegration.deleteMany({ where: { workspaceId } });
  }

  // ─── Token refresh helper ────────────────────────────────────────────────

  private async getAuthenticatedClient(workspaceId: string): Promise<OAuth2Client> {
    const integration = await this.prisma.googleIntegration.findUnique({
      where: { workspaceId },
    });
    if (!integration) throw new NotFoundException('Google account not connected');

    const client = this.createOAuthClient();
    client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
      expiry_date: integration.expiry.getTime(),
    });

    // Auto-refresh if expired or expiring within 5 min
    if (integration.expiry.getTime() < Date.now() + 5 * 60 * 1000) {
      const { credentials } = await client.refreshAccessToken();
      client.setCredentials(credentials);
      await this.prisma.googleIntegration.update({
        where: { workspaceId },
        data: {
          accessToken: credentials.access_token!,
          expiry: new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000),
        },
      });
    }

    return client;
  }

  // ─── Google Sheets ───────────────────────────────────────────────────────

  /** List the user's Google Spreadsheets */
  async listSpreadsheets(workspaceId: string) {
    const auth = await this.getAuthenticatedClient(workspaceId);
    const drive = google.drive({ version: 'v3', auth });
    const res = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'files(id,name)',
      pageSize: 50,
      orderBy: 'viewedByMeTime desc',
    });
    return res.data.files ?? [];
  }

  /** List the sheet tabs inside a spreadsheet */
  async listSheetTabs(workspaceId: string, spreadsheetId: string) {
    const auth = await this.getAuthenticatedClient(workspaceId);
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties',
    });
    return (res.data.sheets ?? []).map((s) => ({
      id: s.properties?.sheetId,
      title: s.properties?.title,
    }));
  }

  /** Save / update the lead-capture sheet config */
  async upsertSheetsConfig(workspaceId: string, dto: UpsertSheetsConfigDto) {
    const fields = dto.fields ?? ['firstName', 'lastName', 'phone', 'email', 'source', 'notes'];
    const config = await this.prisma.leadCaptureConfig.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        sheetId: dto.sheetId,
        sheetName: dto.sheetName ?? 'Leads',
        fields,
      },
      update: {
        sheetId: dto.sheetId,
        sheetName: dto.sheetName ?? 'Leads',
        fields,
        active: true,
      },
    });

    // Ensure headers exist in the sheet
    await this.ensureSheetHeaders(workspaceId, config.sheetId, config.sheetName, fields);

    return config;
  }

  /** Ensure the first row of the sheet contains column headers */
  private async ensureSheetHeaders(
    workspaceId: string,
    spreadsheetId: string,
    sheetName: string,
    fields: string[],
  ) {
    try {
      const auth = await this.getAuthenticatedClient(workspaceId);
      const sheets = google.sheets({ version: 'v4', auth });
      const range = `${sheetName}!A1:Z1`;

      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const hasHeaders = (existing.data.values?.[0]?.length ?? 0) > 0;
      if (hasHeaders) return;

      const headers = [...fields.map((f) => FIELD_LABELS[f] ?? f), 'Timestamp'];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });

      // Bold the header row
      const sheetsRes = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties',
      });
      const sheetObj = sheetsRes.data.sheets?.find(
        (s) => s.properties?.title === sheetName,
      );
      if (sheetObj?.properties?.sheetId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId: sheetObj.properties.sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                  },
                  cell: {
                    userEnteredFormat: { textFormat: { bold: true } },
                  },
                  fields: 'userEnteredFormat.textFormat.bold',
                },
              },
            ],
          },
        });
      }
    } catch (err) {
      this.logger.warn('Could not auto-create sheet headers', err);
    }
  }

  /**
   * Append a lead row to the configured Google Sheet.
   * Called automatically when a contact is created.
   * Never throws — silently logs errors so chat flow is never blocked.
   */
  async appendLeadRow(workspaceId: string, leadData: Record<string, string>) {
    try {
      const config = await this.prisma.leadCaptureConfig.findUnique({
        where: { workspaceId },
      });
      if (!config || !config.active) return;

      const auth = await this.getAuthenticatedClient(workspaceId);
      const sheets = google.sheets({ version: 'v4', auth });
      const fields = config.fields as string[];
      const row = [
        ...fields.map((f) => leadData[f] ?? ''),
        new Date().toISOString(),
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId: config.sheetId,
        range: `${config.sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [row] },
      });
    } catch (err) {
      this.logger.error(`appendLeadRow failed for workspace ${workspaceId}`, err);
    }
  }

  /** Append a test row to verify the connection */
  async testSheetConnection(workspaceId: string) {
    await this.appendLeadRow(workspaceId, {
      firstName: 'Test',
      lastName: 'Lead',
      phone: '+27001234567',
      email: 'test@example.com',
      source: 'Test',
      notes: 'This is a test row from Appleberry',
    });
    return { ok: true };
  }

  // ─── Google Calendar ─────────────────────────────────────────────────────

  /** Save / update calendar config */
  async upsertCalendarConfig(workspaceId: string, dto: UpsertCalendarConfigDto) {
    return this.prisma.calendarConfig.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        calendarId: dto.calendarId ?? 'primary',
        businessEmail: dto.businessEmail,
        slotDuration: dto.slotDuration ?? 60,
        bookingWindowDays: dto.bookingWindowDays ?? 14,
      },
      update: {
        calendarId: dto.calendarId ?? 'primary',
        businessEmail: dto.businessEmail,
        slotDuration: dto.slotDuration ?? 60,
        bookingWindowDays: dto.bookingWindowDays ?? 14,
        active: true,
      },
    });
  }

  /** List the user's Google Calendars */
  async listCalendars(workspaceId: string) {
    const auth = await this.getAuthenticatedClient(workspaceId);
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.calendarList.list();
    return (res.data.items ?? []).map((c) => ({
      id: c.id,
      summary: c.summary,
      primary: c.primary,
    }));
  }

  /** Check if a time slot is free using the FreeBusy API */
  async checkAvailability(workspaceId: string, dto: CheckAvailabilityDto) {
    const calConfig = await this.prisma.calendarConfig.findUnique({
      where: { workspaceId },
    });
    if (!calConfig) throw new NotFoundException('Calendar not configured');

    const auth = await this.getAuthenticatedClient(workspaceId);
    const calendar = google.calendar({ version: 'v3', auth });

    const duration = dto.durationMinutes ?? calConfig.slotDuration;
    const start = new Date(`${dto.date}T${String(dto.hour).padStart(2, '0')}:00:00`);
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: calConfig.calendarId }],
      },
    });

    const busy = res.data.calendars?.[calConfig.calendarId]?.busy ?? [];
    const available = busy.length === 0;

    // If busy, suggest next available slot
    let suggestion: string | null = null;
    if (!available) {
      suggestion = await this.findNextAvailableSlot(
        workspaceId,
        auth,
        calConfig.calendarId,
        end,
        duration,
        calConfig.bookingWindowDays,
      );
    }

    return { available, start: start.toISOString(), end: end.toISOString(), suggestion };
  }

  private async findNextAvailableSlot(
    workspaceId: string,
    auth: OAuth2Client,
    calendarId: string,
    from: Date,
    durationMin: number,
    windowDays: number,
  ): Promise<string | null> {
    try {
      const calendar = google.calendar({ version: 'v3', auth });
      const windowEnd = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);

      // Check up to 20 slots in 1-hour increments
      let candidate = new Date(from);
      for (let i = 0; i < 20; i++) {
        candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
        if (candidate >= windowEnd) break;

        // Skip outside 8:00–18:00
        const hour = candidate.getHours();
        if (hour < 8 || hour >= 18) continue;

        const candidateEnd = new Date(candidate.getTime() + durationMin * 60 * 1000);
        const res = await calendar.freebusy.query({
          requestBody: {
            timeMin: candidate.toISOString(),
            timeMax: candidateEnd.toISOString(),
            items: [{ id: calendarId }],
          },
        });
        const busy = res.data.calendars?.[calendarId]?.busy ?? [];
        if (busy.length === 0) return candidate.toISOString();
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Create a calendar event / booking */
  async createBooking(workspaceId: string, dto: CreateBookingDto) {
    const calConfig = await this.prisma.calendarConfig.findUnique({
      where: { workspaceId },
    });
    if (!calConfig) throw new NotFoundException('Calendar not configured');

    const auth = await this.getAuthenticatedClient(workspaceId);
    const calendar = google.calendar({ version: 'v3', auth });

    const duration = dto.durationMinutes ?? calConfig.slotDuration;
    const start = new Date(dto.startTime);
    const end = new Date(start.getTime() + duration * 60 * 1000);

    const attendees: { email: string }[] = [{ email: calConfig.businessEmail }];
    if (dto.customerEmail) attendees.push({ email: dto.customerEmail });

    const res = await calendar.events.insert({
      calendarId: calConfig.calendarId,
      sendUpdates: 'all',
      requestBody: {
        summary: dto.title,
        description: dto.notes
          ? `${dto.notes}\n\nBooked via Appleberry Messaging OS`
          : 'Booked via Appleberry Messaging OS',
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees,
      },
    });

    return {
      eventId: res.data.id,
      htmlLink: res.data.htmlLink,
      start: start.toISOString(),
      end: end.toISOString(),
      title: dto.title,
    };
  }
}
