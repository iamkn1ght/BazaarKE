import "server-only";
import { railFetch, type RailClientConfig } from "../_shared/railFetch";
import type { MessageStatus, SendMessageInput, SendMessageResult } from "./types";

/**
 * Todoku rail client (server-only). HMAC-signed via the shared signer (prefix "Todoku").
 * Secret encoding: base64url-43 (same as KP; NOT hex like Identiti).
 */

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

function getConfig(): RailClientConfig {
  const baseUrl = process.env.TODOKU_API_BASE;
  const appId = process.env.TODOKU_APP_ID;
  const secret = process.env.TODOKU_APP_SECRET;
  if (!baseUrl || !appId || !secret) {
    throw new Error("RAIL_CONFIG_INCOMPLETE: todoku (need TODOKU_API_BASE, TODOKU_APP_ID, TODOKU_APP_SECRET)");
  }
  if (!BASE64URL_43.test(secret)) {
    throw new Error("RAIL_CONFIG_BAD_ENCODING: todoku.APP_SECRET (expected base64url-43)");
  }
  return { prefix: "Todoku", baseUrl: baseUrl.replace(/\/+$/, ""), appId, secret };
}

export interface CallContext {
  traceparent?: string;
}

/** POST /v1/messages/send — single transactional/marketing send. Do NOT send an X-Todoku-Tenant header. */
export async function sendMessage(input: SendMessageInput, ctx: CallContext = {}): Promise<SendMessageResult> {
  const { data } = await railFetch<SendMessageResult>(getConfig(), {
    method: "POST",
    path: "/v1/messages/send",
    body: input,
    idempotencyKey: input.idempotency_key,
    traceparent: ctx.traceparent,
  });
  return data;
}

/** GET /v1/messages/{id} — delivery status. */
export async function getMessage(messageId: string, ctx: CallContext = {}): Promise<MessageStatus> {
  const { data } = await railFetch<MessageStatus>(getConfig(), {
    method: "GET",
    path: `/v1/messages/${encodeURIComponent(messageId)}`,
    traceparent: ctx.traceparent,
  });
  return data;
}
