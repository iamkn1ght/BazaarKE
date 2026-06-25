import "server-only";
import { randomUUID } from "crypto";
import { RailError, type RailEnvelope } from "../_shared/railFetch";
import { assertContainmentSafe } from "./containment";
import { buildThreeHeaderAuth } from "./threeHeaderAuth";
import { getHakkenJwt } from "./jwt";
import {
  HAKKEN_APP_KEY_DEFAULT,
  type Broadcast,
  type BroadcastInput,
  type Entity,
  type RankingQueryInput,
  type RankingResult,
  type RegisterEntityInput,
} from "./types";

/**
 * Hakken client (server-only) — OUTBOUND discovery. Isolated from the 4-rail signer: three-header
 * pilot auth + an Identiti aud=hakken JWT. Doubly INERT today: getConfig() throws
 * RAIL_CONFIG_INCOMPLETE (HAKKEN_* unset) AND getHakkenJwt() defers (no aud=hakken). Every payload
 * passes the regulatory walls (assertContainmentSafe) BEFORE the JWT/network — fail-closed.
 */

interface HakkenConfig {
  baseUrl: string;
  appKey: string;
  appSecret: string;
}

function getConfig(): HakkenConfig {
  const baseUrl = process.env.HAKKEN_API_BASE;
  const appKey = process.env.HAKKEN_APP_KEY ?? HAKKEN_APP_KEY_DEFAULT;
  const appSecret = process.env.HAKKEN_APP_SECRET;
  if (!baseUrl || !appSecret) {
    throw new Error("RAIL_CONFIG_INCOMPLETE: hakken (need HAKKEN_API_BASE, HAKKEN_APP_SECRET) — Phase 2, not provisioned yet");
  }
  // Secret ENCODING is TBC at issuance (OPERATOR_REQUEST_HAKKEN.md §2) — validate once Silvia confirms
  // hex-64 vs base64url-43; for now accept any non-empty secret.
  return { baseUrl: baseUrl.replace(/\/+$/, ""), appKey, appSecret };
}

export interface CallContext {
  /** Buyer's Identiti account_uuid — the aud=hakken JWT is minted for it. */
  accountUuid: string;
  traceparent?: string;
  idempotencyKey?: string;
}

async function hakkenFetch<T>(
  op: string,
  path: string,
  body: unknown,
  ctx: CallContext,
  allowSourcePayment = false,
): Promise<T> {
  const cfg = getConfig();

  // Serialize ONCE, then run the regulatory walls over the EXACT bytes that will be sent (post-toJSON)
  // — so a toJSON()/getter cannot smuggle a money key past a wall that inspected the live object. The
  // walls run BEFORE the JWT/network: a money-shaped key or PII never leaves the app (fail-closed).
  const rawBody = body === undefined ? undefined : JSON.stringify(body);
  if (rawBody !== undefined) assertContainmentSafe(JSON.parse(rawBody), { allowSourcePayment });

  const jwt = await getHakkenJwt(ctx.accountUuid, op); // throws HakkenDeferredError until aud=hakken lands
  const headers = buildThreeHeaderAuth({
    jwt,
    appKey: cfg.appKey,
    appSecret: cfg.appSecret,
    idempotencyKey: ctx.idempotencyKey ?? randomUUID(),
    traceparent: ctx.traceparent,
  });
  headers["Content-Type"] = "application/json; charset=utf-8";

  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "POST",
    headers,
    body: rawBody,
    cache: "no-store",
  });
  const text = await res.text();
  let env: RailEnvelope<T>;
  try {
    env = text ? (JSON.parse(text) as RailEnvelope<T>) : { ok: res.ok };
  } catch {
    throw new RailError("Hakken", res.status, "RAIL_BAD_JSON", `Hakken: non-JSON response (${res.status})`);
  }
  if (!res.ok || env.ok === false) {
    throw new RailError("Hakken", res.status, env.error?.code ?? `HTTP_${res.status}`, env.error?.message ?? `Hakken call failed (${res.status})`, env.meta?.request_id);
  }
  return env.data as T;
}

/** POST /v1/entities — register a product entity (source_payment carve-out applies). */
export async function registerEntity(input: RegisterEntityInput, ctx: CallContext): Promise<Entity> {
  return hakkenFetch<Entity>("entities.register", "/v1/entities", input, ctx, true);
}

/** POST /v1/broadcasts — new_arrival / restock (no carve-out; requires consent_scope + ttl_at). */
export async function publishBroadcast(input: BroadcastInput, ctx: CallContext): Promise<Broadcast> {
  return hakkenFetch<Broadcast>("broadcasts.publish", "/v1/broadcasts", input, ctx);
}

/** POST /v1/ranking/query — cross-app discovery ranking. */
export async function rankingQuery(input: RankingQueryInput, ctx: CallContext): Promise<RankingResult> {
  return hakkenFetch<RankingResult>("ranking.query", "/v1/ranking/query", input, ctx);
}

/** True only when the Hakken env is present — the gate for attempting any discovery call. */
export function hakkenConfigured(): boolean {
  return Boolean(process.env.HAKKEN_API_BASE && process.env.HAKKEN_APP_SECRET);
}
