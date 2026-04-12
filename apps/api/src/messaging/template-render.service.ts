import { Injectable } from '@nestjs/common';
import type { Contact, Template, TemplateType } from '@prisma/client';

type VariableSpec = { fallback?: string } | string;

@Injectable()
export class TemplateRenderService {
  private readonly varRegex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  /**
   * `variables` JSON maps name -> { fallback } or plain string default.
   */
  interpolate(
    template: Pick<Template, 'content' | 'type' | 'variables'>,
    contact: Pick<Contact, 'firstName' | 'lastName' | 'phone' | 'email'>,
    globalFallback = '',
  ): string {
    const raw = this.extractRenderableText(template.content, template.type);
    const spec =
      template.variables && typeof template.variables === 'object'
        ? (template.variables as Record<string, VariableSpec>)
        : {};

    return raw.replace(this.varRegex, (_m, name: string) => {
      const v = this.resolveVariable(name, contact, spec, globalFallback);
      return v;
    });
  }

  private extractRenderableText(content: string, type: TemplateType): string {
    if (type === 'MEDIA') {
      try {
        const parsed = JSON.parse(content) as { text?: string };
        if (parsed?.text && typeof parsed.text === 'string') {
          return parsed.text;
        }
      } catch {
        /* fall through */
      }
    }
    return content;
  }

  private resolveVariable(
    name: string,
    contact: Pick<Contact, 'firstName' | 'lastName' | 'phone' | 'email'>,
    spec: Record<string, VariableSpec>,
    globalFallback: string,
  ): string {
    const fromContact = this.contactField(name, contact);
    if (fromContact !== undefined && fromContact !== null && fromContact !== '') {
      return String(fromContact);
    }

    const meta = spec[name];
    if (typeof meta === 'string' && meta.length) {
      return meta;
    }
    if (meta && typeof meta === 'object' && meta.fallback != null) {
      return String(meta.fallback);
    }

    return globalFallback;
  }

  private contactField(
    name: string,
    contact: Pick<Contact, 'firstName' | 'lastName' | 'phone' | 'email'>,
  ): string | undefined {
    switch (name) {
      case 'firstName':
        return contact.firstName;
      case 'lastName':
        return contact.lastName;
      case 'phone':
        return contact.phone;
      case 'email':
        return contact.email ?? undefined;
      default:
        return undefined;
    }
  }
}
