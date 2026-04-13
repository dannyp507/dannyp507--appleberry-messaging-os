export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface WhatsAppProvider {
  sendText(to: string, message: string, accountId?: string): Promise<void>;
}
