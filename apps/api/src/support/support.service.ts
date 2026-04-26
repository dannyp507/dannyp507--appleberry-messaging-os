import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { ContactFormDto } from './dto/contact-form.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly config: ConfigService) {}

  async sendContactEmail(dto: ContactFormDto): Promise<void> {
    const smtpHost   = this.config.get<string>('SMTP_HOST');
    const smtpPort   = this.config.get<number>('SMTP_PORT', 587);
    const smtpUser   = this.config.get<string>('SMTP_USER');
    const smtpPass   = this.config.get<string>('SMTP_PASS');
    const supportTo  = this.config.get<string>('SUPPORT_EMAIL', 'Appleberrycare246@gmail.com');

    if (!smtpHost || !smtpUser || !smtpPass) {
      // Email not configured — log it so nothing is lost
      this.logger.warn(
        `[Support form — email not configured] From: ${dto.name} <${dto.email}> | Subject: ${dto.subject} | Message: ${dto.message}`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;background:#f9f9f9;border-radius:8px;">
        <h2 style="color:#6366F1;margin-top:0;">📬 New Support Request — Appleberry</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;width:100px;"><strong>Name</strong></td><td style="padding:8px 0;">${dto.name}</td></tr>
          <tr><td style="padding:8px 0;color:#666;"><strong>Email</strong></td><td style="padding:8px 0;"><a href="mailto:${dto.email}">${dto.email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#666;"><strong>Subject</strong></td><td style="padding:8px 0;">${dto.subject}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        <h3 style="color:#374151;margin-top:0;">Message</h3>
        <p style="color:#374151;line-height:1.6;white-space:pre-wrap;">${dto.message}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
        <p style="font-size:12px;color:#9ca3af;">Sent via Appleberry Help &amp; Support form</p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Appleberry Support" <${smtpUser}>`,
      to: supportTo,
      replyTo: dto.email,
      subject: `[Support] ${dto.subject} — from ${dto.name}`,
      html,
    });

    this.logger.log(`Support email sent from ${dto.email} → ${supportTo}`);
  }
}
