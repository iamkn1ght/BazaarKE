import "server-only";
import { signRequest, type RailPrefix } from "./signRequest";

/**
 * Thin signed-fetch wrapper shared by the KMV rail clients (Identiti, Kipkiren Pay, Todoku).
 * Signs with the shared per-request HMAC, sends the EXACT raw bytes it signed, and unwraps
 * the {ok, data, meta} / {ok:false, error, meta} envelope. Throws RailError on failure.
 *
 * Route handlers that import a client built on this MUST declare `export const runtime = 'nodejs'`
 * (crypto.createHmac is Node-only; the Edge runtime silently fails at request time).
 */

export interface RailEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; detail?: unknown; field?: string };
  meta?: { request_id?: string; timestamp?: string };
}

export class RailError extends Error {
  constructor(
    public readonly rail: string, // RailPrefix for the shared rails; "Itafika" uses its own forked signer
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "RailError";
  }
}

export interface RailClientConfig {
  prefix: RailPrefix;
  baseUrl: string; // no trailing slash
  appId: string;
  secret: string;
}

export interface RailCallOptions {
  method: string;
  /** Path WITH the /v1/ prefix; may include a query string. */
  path: string;
  /** Plain object serialized to JSON. Omit for a bodyless GET. */
  body?: unknown;
  /** UUIDv4; auto-generated for writes when omitted. */
  idempotencyKey?: string;
  /** W3C traceparent for §A.11 cross-rail audit propagation. */
  traceparent?: string;
}

export interface RailResult<T> {
  data: T;
  requestId?: string;
}

export async function railFetch<T>(cfg: RailClientConfig, opts: RailCallOptions): Promise<RailResult<T>> {
  const method = opts.method.toUpperCase();
  // Never send a body on GET; serialize once and sign/send the identical bytes.
  const rawBody = method === "GET" || opts.body === undefined ? undefined : JSON.stringify(opts.body);

  const { headers } = signRequest({
    prefix: cfg.prefix,
    appId: cfg.appId,
    secret: cfg.secret,
    method,
    pathAndQuery: opts.path,
    body: rawBody,
    idempotencyKey: opts.idempotencyKey,
  });
  if (opts.traceparent) headers["traceparent"] = opts.traceparent;

  const res = await fetch(`${cfg.baseUrl}${opts.path}`, {
    method,
    headers,
    body: rawBody, // the exact bytes that were hashed into the canonical
    cache: "no-store",
  });

  const text = await res.text();
  let env: RailEnvelope<T>;
  try {
    env = text ? (JSON.parse(text) as RailEnvelope<T>) : { ok: res.ok };
  } catch {
    throw new RailError(cfg.prefix, res.status, "RAIL_BAD_JSON", `${cfg.prefix}: non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || env.ok === false) {
    const code = env.error?.code ?? `HTTP_${res.status}`;
    const message = env.error?.message ?? `${cfg.prefix} call failed (${res.status})`;
    throw new RailError(cfg.prefix, res.status, code, message, env.meta?.request_id);
  }

  return { data: env.data as T, requestId: env.meta?.request_id };
}
