// ─── Outbound interactive message shapes (WhatsApp Cloud API) ────────────────

export interface WaButton {
  type: 'reply';
  reply: { id: string; title: string }; // title max 20 chars
}

export interface WaListRow {
  id: string;
  title: string;       // max 24 chars
  description?: string; // max 72 chars
}

export interface WaListSection {
  title?: string;      // max 24 chars
  rows: WaListRow[];   // max 10 rows total across all sections
}

/** Union of all interactive message variants */
export type WaInteractive =
  | {
      type: 'button';
      header?: { type: 'text'; text: string };
      body: { text: string };
      footer?: { text: string };
      action: { buttons: WaButton[] }; // max 3 buttons
    }
  | {
      type: 'list';
      header?: { type: 'text'; text: string };
      body: { text: string };
      footer?: { text: string };
      action: {
        button: string;             // trigger button label, max 20 chars
        sections: WaListSection[];
      };
    };

// ─── Inbound Cloud API webhook shapes ────────────────────────────────────────

export interface CloudApiMessage {
  from: string;
  id: string;
  timestamp: string;
  type:
    | 'text'
    | 'interactive'
    | 'button'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'sticker'
    | 'order'
    | 'unknown';
  text?: { body: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string }; // quick-reply button tap
}

export interface CloudApiWebhookChange {
  value: {
    messaging_product: string;
    metadata: { display_phone_number: string; phone_number_id: string };
    contacts?: Array<{ profile: { name: string }; wa_id: string }>;
    messages?: CloudApiMessage[];
    statuses?: Array<{
      id: string;
      status: 'sent' | 'delivered' | 'read' | 'failed';
      timestamp: string;
      recipient_id: string;
    }>;
  };
  field: string;
}

export interface CloudApiWebhookPayload {
  object: string;
  entry: Array<{ id: string; changes: CloudApiWebhookChange[] }>;
}

// ─── Per-account credentials stored in WhatsAppAccount.credentials (JSON) ────

export interface CloudApiCredentials {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
  graphVersion?: string; // default 'v21.0'
  verifyToken?: string;  // random string you set when registering webhook with Meta
}
