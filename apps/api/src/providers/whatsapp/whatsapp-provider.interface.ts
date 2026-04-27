export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface ButtonItem {
  id: string;
  title: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface WhatsAppProvider {
  sendText(to: string, message: string, accountId?: string): Promise<void>;

  /** Send a media file (image / video / audio / document).
   *  `filePath` is the absolute path on the server filesystem or a public URL.
   *  `caption` is optional text shown below the media in WhatsApp. */
  sendMedia?(to: string, filePath: string, caption: string | undefined, accountId?: string): Promise<void>;

  /** Send an interactive button message (up to 3 buttons). */
  sendButtons?(
    to: string,
    body: string,
    buttons: ButtonItem[],
    header?: string,
    footer?: string,
    accountId?: string,
  ): Promise<void>;

  /** Send an interactive list message. */
  sendList?(
    to: string,
    body: string,
    buttonText: string,
    sections: ListSection[],
    header?: string,
    footer?: string,
    accountId?: string,
  ): Promise<void>;
}
