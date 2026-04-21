export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface WhatsAppProvider {
  sendText(to: string, message: string, accountId?: string): Promise<void>;
  /** Send a media file (image / video / audio / document).
   *  `filePath` is the absolute path on the server filesystem.
   *  `caption` is optional text shown below the media in WhatsApp. */
  sendMedia?(to: string, filePath: string, caption: string | undefined, accountId?: string): Promise<void>;
}
