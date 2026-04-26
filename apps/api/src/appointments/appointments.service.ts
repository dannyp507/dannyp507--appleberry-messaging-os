import { BadRequestException, Injectable } from '@nestjs/common';
import { ChatbotFlowStatus, ChatbotNodeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleSheetsService } from '../google-sheets/google-sheets.service';

type JsonRecord = Record<string, string>;

function formatParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const out: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function zonedDateTimeToUtc(
  dateText: string,
  timeText: string,
  timeZone: string,
) {
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = timeText.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new BadRequestException(
      'Appointment date/time must use YYYY-MM-DD and HH:mm',
    );
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const zoned = formatParts(utcGuess, timeZone);
  const zonedUtc = Date.UTC(
    Number(zoned.year),
    Number(zoned.month) - 1,
    Number(zoned.day),
    Number(zoned.hour),
    Number(zoned.minute),
    Number(zoned.second),
  );
  return new Date(utcGuess.getTime() - (zonedUtc - utcGuess.getTime()));
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleSheets: GoogleSheetsService,
  ) {}

  async checkAvailability(params: {
    workspaceId: string;
    vars: JsonRecord;
    content: Record<string, unknown>;
  }) {
    const settings = await this.prisma.workspaceGoogleSheetsSettings.findUnique(
      {
        where: { workspaceId: params.workspaceId },
      },
    );
    if (!settings?.googleRefreshToken || !settings.calendarId) {
      return {
        ...params.vars,
        appointmentStatus: 'UNCONFIGURED',
        appointmentError: 'Google Calendar is not configured',
      };
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: params.workspaceId },
    });
    const timeZone = workspace?.timezone ?? 'UTC';
    const dateKey =
      typeof params.content.dateVariableKey === 'string'
        ? params.content.dateVariableKey
        : 'appointmentDate';
    const timeKey =
      typeof params.content.timeVariableKey === 'string'
        ? params.content.timeVariableKey
        : 'appointmentTime';

    const dateText = params.vars[dateKey];
    const timeText = params.vars[timeKey];
    if (!dateText || !timeText) {
      return {
        ...params.vars,
        appointmentStatus: 'INVALID',
        appointmentError: 'Missing appointment date or time',
      };
    }

    const start = zonedDateTimeToUtc(dateText, timeText, timeZone);
    const end = new Date(
      start.getTime() + settings.appointmentDurationMins * 60 * 1000,
    );
    const accessToken = await this.googleSheets.getWorkspaceAccessToken(
      params.workspaceId,
    );
    if (!accessToken) {
      return {
        ...params.vars,
        appointmentStatus: 'UNCONFIGURED',
        appointmentError: 'Google account is not connected',
      };
    }

    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        timeZone,
        items: [{ id: settings.calendarId }],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      calendars?: Record<string, { busy?: Array<unknown> }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      return {
        ...params.vars,
        appointmentStatus: 'ERROR',
        appointmentError:
          json.error?.message ?? 'Calendar availability check failed',
      };
    }

    const busy = json.calendars?.[settings.calendarId]?.busy ?? [];
    return {
      ...params.vars,
      appointmentStatus: busy.length === 0 ? 'AVAILABLE' : 'UNAVAILABLE',
      appointmentStart: start.toISOString(),
      appointmentEnd: end.toISOString(),
      appointmentTimeZone: timeZone,
      calendarId: settings.calendarId,
    };
  }

  async createAppointment(params: {
    workspaceId: string;
    contact: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
    };
    vars: JsonRecord;
    content: Record<string, unknown>;
  }) {
    const settings = await this.prisma.workspaceGoogleSheetsSettings.findUnique(
      {
        where: { workspaceId: params.workspaceId },
      },
    );
    if (!settings?.googleRefreshToken || !settings.calendarId) {
      return {
        ...params.vars,
        appointmentStatus: 'UNCONFIGURED',
        appointmentError: 'Google Calendar is not configured',
      };
    }

    const accessToken = await this.googleSheets.getWorkspaceAccessToken(
      params.workspaceId,
    );
    if (!accessToken) {
      return {
        ...params.vars,
        appointmentStatus: 'UNCONFIGURED',
        appointmentError: 'Google account is not connected',
      };
    }

    const serviceKey =
      typeof params.content.serviceVariableKey === 'string'
        ? params.content.serviceVariableKey
        : 'serviceName';
    const summaryPrefix =
      typeof params.content.summaryPrefix === 'string'
        ? params.content.summaryPrefix
        : 'Appointment';
    const serviceName = params.vars[serviceKey] || 'Consultation';
    const startIso = params.vars.appointmentStart;
    const endIso = params.vars.appointmentEnd;
    const timeZone = params.vars.appointmentTimeZone || 'UTC';

    if (!startIso || !endIso) {
      return {
        ...params.vars,
        appointmentStatus: 'INVALID',
        appointmentError: 'Appointment slot was not prepared before booking',
      };
    }

    const summary =
      `${summaryPrefix}: ${serviceName} - ${params.contact.firstName}`.trim();
    const description = [
      `Contact: ${params.contact.firstName} ${params.contact.lastName}`.trim(),
      `Phone: ${params.contact.phone}`,
      params.contact.email ? `Email: ${params.contact.email}` : '',
      `Service: ${serviceName}`,
    ]
      .filter(Boolean)
      .join('\n');

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        settings.calendarId,
      )}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          summary,
          description,
          start: { dateTime: startIso, timeZone },
          end: { dateTime: endIso, timeZone },
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      htmlLink?: string;
      error?: { message?: string };
    };

    if (!res.ok || !json.id) {
      return {
        ...params.vars,
        appointmentStatus: 'ERROR',
        appointmentError:
          json.error?.message ?? 'Calendar event creation failed',
      };
    }

    await this.googleSheets.captureAppointmentRow({
      workspaceId: params.workspaceId,
      contact: params.contact,
      serviceName,
      calendarId: settings.calendarId,
      eventId: json.id,
      startIso,
      endIso,
      status: 'BOOKED',
    });

    return {
      ...params.vars,
      appointmentStatus: 'BOOKED',
      appointmentEventId: json.id,
      appointmentEventUrl: json.htmlLink ?? '',
      appointmentServiceName: serviceName,
    };
  }

  async createBookingFlowTemplate(workspaceId: string, name: string) {
    const flow = await this.prisma.chatbotFlow.create({
      data: { workspaceId, name, status: ChatbotFlowStatus.DRAFT },
    });

    const intro = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.TEXT,
        content: {
          text: 'Let us get your appointment booked. I will ask for your service, date, and time.',
        } as Prisma.InputJsonValue,
        position: { x: 60, y: 80 } as Prisma.InputJsonValue,
      },
    });
    const service = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.QUESTION,
        content: {
          prompt: 'What service would you like to book?',
          variableKey: 'serviceName',
        } as Prisma.InputJsonValue,
        position: { x: 360, y: 80 } as Prisma.InputJsonValue,
      },
    });
    const date = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.QUESTION,
        content: {
          prompt: 'Please reply with your preferred date in YYYY-MM-DD format.',
          variableKey: 'appointmentDate',
        } as Prisma.InputJsonValue,
        position: { x: 660, y: 80 } as Prisma.InputJsonValue,
      },
    });
    const time = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.QUESTION,
        content: {
          prompt: 'Please reply with your preferred time in HH:mm format.',
          variableKey: 'appointmentTime',
        } as Prisma.InputJsonValue,
        position: { x: 960, y: 80 } as Prisma.InputJsonValue,
      },
    });
    const check = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.WEBHOOK,
        content: {
          type: 'APPOINTMENT_CHECK',
          dateVariableKey: 'appointmentDate',
          timeVariableKey: 'appointmentTime',
          serviceVariableKey: 'serviceName',
        } as Prisma.InputJsonValue,
        position: { x: 1260, y: 80 } as Prisma.InputJsonValue,
      },
    });
    const condition = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.CONDITION,
        content: {
          variableKey: 'appointmentStatus',
        } as Prisma.InputJsonValue,
        position: { x: 1560, y: 80 } as Prisma.InputJsonValue,
      },
    });
    const create = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.WEBHOOK,
        content: {
          type: 'APPOINTMENT_CREATE',
          serviceVariableKey: 'serviceName',
          summaryPrefix: 'Appointment',
        } as Prisma.InputJsonValue,
        position: { x: 1860, y: -20 } as Prisma.InputJsonValue,
      },
    });
    const booked = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.TEXT,
        content: {
          text: 'Your appointment for {{appointmentServiceName}} is booked on {{appointmentStart}}.',
        } as Prisma.InputJsonValue,
        position: { x: 2160, y: -20 } as Prisma.InputJsonValue,
      },
    });
    const unavailable = await this.prisma.chatbotNode.create({
      data: {
        flowId: flow.id,
        type: ChatbotNodeType.TEXT,
        content: {
          text: 'That time is not available right now. Please reply with a different date or time and try again.',
        } as Prisma.InputJsonValue,
        position: { x: 1860, y: 180 } as Prisma.InputJsonValue,
      },
    });

    await this.prisma.chatbotEdge.createMany({
      data: [
        { flowId: flow.id, fromNodeId: intro.id, toNodeId: service.id },
        { flowId: flow.id, fromNodeId: service.id, toNodeId: date.id },
        { flowId: flow.id, fromNodeId: date.id, toNodeId: time.id },
        { flowId: flow.id, fromNodeId: time.id, toNodeId: check.id },
        { flowId: flow.id, fromNodeId: check.id, toNodeId: condition.id },
        {
          flowId: flow.id,
          fromNodeId: condition.id,
          toNodeId: create.id,
          condition: { equals: 'AVAILABLE' } as Prisma.InputJsonValue,
        },
        { flowId: flow.id, fromNodeId: condition.id, toNodeId: unavailable.id },
        { flowId: flow.id, fromNodeId: create.id, toNodeId: booked.id },
      ],
    });

    return this.prisma.chatbotFlow.update({
      where: { id: flow.id },
      data: { entryNodeId: intro.id },
      include: {
        nodes: true,
        edges: true,
        _count: { select: { nodes: true, edges: true } },
      },
    });
  }
}
