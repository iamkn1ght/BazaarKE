import "server-only";
import { mintPhoneToken } from "../identiti";
import { sendMessage } from "./client";
import { templateChannel, templateId, type TodokuTemplateKey } from "./templates";
import type { SendMessageResult } from "./types";

/**
 * Account-level Todoku send: mints a fresh Identiti phone token (audience=todoku) per send and
 * dispatches a templated message. Raw MSISDNs never appear here (Cardinal Rule).
 * The pure idempotency-key builder lives in ./keys (so it stays unit-testable).
 */

async function resolveRecipientToken(accountUuid: string, traceparent?: string): Promise<string> {
  if (process.env.TODOKU_SANDBOX_TOKENS === "true") {
    // Todoku sandbox rejects real Identiti sandbox JWTs (CHAN_PHONE_TOKEN_INVALID); use the synth prefix.
    return `SANDBOX_TOKEN_DELIVER_OK_unique_accessories_${accountUuid}`;
  }
  const token = await mintPhoneToken(accountUuid, { traceparent });
  return token.phone_token; // fresh per send — never cached
}

export interface NotifyParams {
  accountUuid: string;
  templateKey: TodokuTemplateKey;
  variables: Record<string, string>;
  idempotencyKey: string;
  traceparent?: string;
}

export async function notifyAccount(params: NotifyParams): Promise<SendMessageResult> {
  const recipient_token = await resolveRecipientToken(params.accountUuid, params.traceparent);
  return sendMessage(
    {
      recipient_token,
      template_id: templateId(params.templateKey),
      template_variables: params.variables,
      channel: templateChannel(params.templateKey),
      idempotency_key: params.idempotencyKey,
    },
    { traceparent: params.traceparent },
  );
}
