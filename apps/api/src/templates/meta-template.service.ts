import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface MetaApiTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

interface MetaCredentials {
  wabaId: string;
  accessToken: string;
  graphVersion: string;
  phoneNumberId: string;
}

@Injectable()
export class MetaTemplateService {
  private readonly logger = new Logger(MetaTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async resolveCloudCreds(workspaceId: string): Promise<MetaCredentials> {
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { workspaceId, providerType: 'CLOUD', isArchived: false },
      select: { credentials: true },
    });
    if (!account) {
      throw new BadRequestException(
        'No WhatsApp Cloud API account found for this workspace. Connect one first.',
      );
    }
    const creds = account.credentials as unknown as MetaCredentials;
    if (!creds?.wabaId || !creds?.accessToken) {
      throw new BadRequestException(
        'Cloud API account is missing credentials (wabaId / accessToken).',
      );
    }
    return creds;
  }

  private toMetaBody(content: string): {
    metaBody: string;
    varMap: Record<string, number>;
    paramCount: number;
  } {
    const varMap: Record<string, number> = {};
    let index = 0;
    const metaBody = content.replace(/\{\{(\w+)\}\}/g, (_match: string, varName: string) => {
      if (!(varName in varMap)) {
        index += 1;
        varMap[varName] = index;
      }
      return `{{${varMap[varName]}}}`;
    });
    return { metaBody, varMap, paramCount: index };
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 512);
  }

  /**
   * Upload an image from a URL to Meta's Resumable Upload API and return the media handle.
   * This handle is required for template submissions with IMAGE header components.
   */
  private async uploadImageToMeta(imageUrl: string, accessToken: string, graphVersion: string): Promise<string> {
    // Step 1: Download the image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new BadRequestException(`Failed to download template image from ${imageUrl}`);
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const fileSize = imgBuffer.length;
    const fileName = imageUrl.split('/').pop() ?? 'image.jpg';
    const fileType = imgRes.headers.get('content-type') ?? 'image/jpeg';

    // Step 2: Create upload session
    const sessionRes = await fetch(`https://graph.facebook.com/${graphVersion}/app/uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_length: fileSize, file_type: fileType, file_name: fileName }),
    });
    const sessionJson = (await sessionRes.json()) as { id?: string; error?: { message: string } };
    if (!sessionRes.ok || !sessionJson.id) {
      throw new BadRequestException(
        `Meta upload session failed: ${sessionJson.error?.message ?? JSON.stringify(sessionJson)}`,
      );
    }
    const sessionId = sessionJson.id;

    // Step 3: Upload image bytes
    const uploadRes = await fetch(`https://graph.facebook.com/${graphVersion}/${sessionId}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${accessToken}`,
        'file_offset': '0',
        'Content-Type': fileType,
      },
      body: imgBuffer,
    });
    const uploadJson = (await uploadRes.json()) as { h?: string; error?: { message: string } };
    if (!uploadRes.ok || !uploadJson.h) {
      throw new BadRequestException(
        `Meta image upload failed: ${uploadJson.error?.message ?? JSON.stringify(uploadJson)}`,
      );
    }
    return uploadJson.h;
  }

  async submitToMeta(workspaceId: string, templateId: string, language = 'en_US') {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, workspaceId },
    });
    if (!template) throw new NotFoundException('Template not found');

    const creds = await this.resolveCloudCreds(workspaceId);
    const { metaBody, varMap, paramCount } = this.toMetaBody(template.content);
    const metaName = this.sanitizeName(template.name);

    const bodyComponent: Record<string, unknown> = { type: 'BODY', text: metaBody };
    if (paramCount > 0) {
      bodyComponent.example = {
        body_text: [Array.from({ length: paramCount }, (_: unknown, i: number) => `example${i + 1}`)],
      };
    }

    const components: Record<string, unknown>[] = [bodyComponent];

    const templateType = (template as any).type as string | undefined;
    const templateMediaUrl = (template as any).mediaUrl as string | null | undefined;

    let hasImageHeader = false;
    if ((templateType === 'MEDIA' || templateType === 'BUTTON') && templateMediaUrl) {
      // For media templates, use IMAGE header format.
      // Meta requires a header_handle (from their Resumable Upload API) as an example.
      this.logger.log(`Uploading template image to Meta for header_handle...`);
      const mediaHandle = await this.uploadImageToMeta(templateMediaUrl, creds.accessToken, creds.graphVersion ?? "v21.0");
      components.unshift({
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: [mediaHandle] },
      });
      hasImageHeader = true;
    } else if (template.header) {
      components.unshift({ type: 'HEADER', format: 'TEXT', text: template.header });
    }
    if (template.footer) {
      components.push({ type: 'FOOTER', text: template.footer });
    }

    // Add BUTTONS component for BUTTON type templates
    const templateButtons = (template as any).buttons as Array<{
      type: 'QUICK_REPLY' | 'URL' | 'PHONE';
      text: string;
      value?: string;
    }> | null | undefined;

    if (templateType === 'BUTTON' && templateButtons && templateButtons.length > 0) {
      const metaButtons = templateButtons.map((btn) => {
        if (btn.type === 'QUICK_REPLY') {
          return { type: 'QUICK_REPLY', text: btn.text };
        } else if (btn.type === 'URL') {
          return { type: 'URL', text: btn.text, url: btn.value ?? '' };
        } else if (btn.type === 'PHONE') {
          return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.value ?? '' };
        }
        return { type: 'QUICK_REPLY', text: btn.text };
      });
      components.push({ type: 'BUTTONS', buttons: metaButtons });
    }

    const payload: Record<string, unknown> = {
      name: metaName,
      category: (template as any).metaCategory ?? 'MARKETING',
      language,
      components,
    };

    const graphVersion = creds.graphVersion ?? 'v21.0';
    const url = `https://graph.facebook.com/${graphVersion}/${creds.wabaId}/message_templates`;
    this.logger.log(`Submitting template "${metaName}" to Meta WABA ${creds.wabaId}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const errObj = json.error as Record<string, unknown> | undefined;
      const errMsg = errObj?.message ? String(errObj.message) : JSON.stringify(json);
      this.logger.error(`Meta template submit failed: ${errMsg}`);
      throw new BadRequestException(`Meta rejected template: ${errMsg}`);
    }

    const metaId = String((json as { id?: string }).id ?? '');
    const metaStatus = String((json as { status?: string }).status ?? 'PENDING');

    const updated = await this.prisma.template.update({
      where: { id: templateId },
      data: {
        metaId,
        metaName,
        metaStatus,
        metaLanguage: language,
        variables: { ...(template.variables as object ?? {}), __metaVarMap: varMap, ...(hasImageHeader ? { __metaImageHeader: true } : {}) },
      } as any,
    });

    this.logger.log(`Template "${metaName}" submitted — Meta status: ${metaStatus}`);
    return updated;
  }

  async syncFromMeta(workspaceId: string) {
    const creds = await this.resolveCloudCreds(workspaceId);
    const graphVersion = creds.graphVersion ?? 'v21.0';

    const url = `https://graph.facebook.com/${graphVersion}/${creds.wabaId}/message_templates?fields=id,name,status,category,language&limit=200`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });

    const json = (await res.json().catch(() => ({}))) as {
      data?: MetaApiTemplate[];
      error?: { message: string };
    };

    if (!res.ok) {
      throw new BadRequestException(
        `Meta sync failed: ${json.error?.message ?? JSON.stringify(json)}`,
      );
    }

    const metaTemplates = json.data ?? [];

    const localTemplates = await this.prisma.template.findMany({
      where: { workspaceId, metaId: { not: null } } as any,
      select: { id: true, metaId: true },
    });

    let updated = 0;
    for (const local of localTemplates) {
      const remote = metaTemplates.find((m) => m.id === (local as any).metaId);
      if (remote) {
        await this.prisma.template.update({
          where: { id: local.id },
          data: { metaStatus: remote.status } as any,
        });
        updated++;
      }
    }

    this.logger.log(
      `Synced ${updated} templates from Meta (${metaTemplates.length} total on Meta)`,
    );
    return {
      synced: updated,
      metaTotal: metaTemplates.length,
      metaTemplates: metaTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        category: t.category,
        language: t.language,
      })),
    };
  }

  async deleteFromMeta(workspaceId: string, templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, workspaceId },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (!(template as any).metaName) {
      throw new BadRequestException('This template has not been submitted to Meta yet.');
    }

    const creds = await this.resolveCloudCreds(workspaceId);
    const graphVersion = creds.graphVersion ?? 'v21.0';
    const url = `https://graph.facebook.com/${graphVersion}/${creds.wabaId}/message_templates?name=${(template as any).metaName}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${creds.accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new BadRequestException(
        `Meta delete failed: ${JSON.stringify((json as { error?: unknown }).error ?? json)}`,
      );
    }

    await this.prisma.template.update({
      where: { id: templateId },
      data: { metaId: null, metaName: null, metaStatus: 'NONE' } as any,
    });

    return { deleted: true, templateId };
  }
}
