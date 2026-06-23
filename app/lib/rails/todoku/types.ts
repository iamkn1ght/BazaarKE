/**
 * Todoku rail types. Source: docs/KMV_RAILS_INTEGRATION_GUIDE.md §5 + RAIL_INTEGRATION_PLAYBOOK §3.3.
 *
 * Field-name traps (wrong key -> 400 additionalProperty): recipient_token (NOT phone_token),
 * template_id (ULID, NOT slug), template_variables (NOT params/variables/vars), channel (required).
 */

export type TodokuChannel = "sms" | "whatsapp" | "voice" | "in_app";

export interface SendMessageInput {
  /** The Identiti phone_token JWT (audience=todoku) — NEVER a raw MSISDN. */
  recipient_token: string;
  /** A 26-char Crockford ULID (NOT the template slug). */
  template_id: string;
  /** Object of template variables (NOT params/variables/vars). */
  template_variables: Record<string, string>;
  channel: TodokuChannel;
  idempotency_key: string;
}

export interface SendMessageResult {
  message_id: string;
  channel: TodokuChannel;
  status: string;
  template_id: string;
  queued_at?: string;
}

export interface MessageStatus {
  message_id: string;
  status: string;
  channel?: TodokuChannel;
}
