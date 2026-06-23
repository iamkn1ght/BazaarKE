import "server-only";
import { RailError, type RailEnvelope } from "../_shared/railFetch";
import { signItafikaRequest } from "./sign";
import type { CreateJobInput, Job, Quote, QuoteInput } from "./types";

/**
 * Itafika rail client (server-only). Uses the forked asymmetric signer (base64 outbound).
 * Secret encoding: hex-64. There is NO separate webhook secret — the same ITAFIKA_APP_SECRET
 * signs both directions.
 */

const HEX_64 = /^[0-9a-f]{64}$/i;

interface ItafikaConfig {
  baseUrl: string;
  appId: string;
  secret: string;
}

function getConfig(): ItafikaConfig {
  const baseUrl = process.env.ITAFIKA_BASE_URL;
  const appId = process.env.ITAFIKA_APP_ID;
  const secret = process.env.ITAFIKA_APP_SECRET;
  if (!baseUrl || !appId || !secret) {
    throw new Error("RAIL_CONFIG_INCOMPLETE: itafika (need ITAFIKA_BASE_URL, ITAFIKA_APP_ID, ITAFIKA_APP_SECRET)");
  }
  if (!HEX_64.test(secret)) {
    throw new Error("RAIL_CONFIG_BAD_ENCODING: itafika.APP_SECRET (expected hex-64)");
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), appId, secret };
}

export interface CallContext {
  traceparent?: string;
  idempotencyKey?: string;
}

async function itafikaFetch<T>(
  method: string,
  path: string,
  body: unknown | undefined,
  ctx: CallContext = {},
): Promise<{ data: T; requestId?: string }> {
  const cfg = getConfig();
  const m = method.toUpperCase();
  const rawBody = m === "GET" || body === undefined ? undefined : JSON.stringify(body);

  const { headers } = signItafikaRequest({
    appId: cfg.appId,
    secret: cfg.secret,
    method: m,
    pathAndQuery: path,
    body: rawBody,
    idempotencyKey: ctx.idempotencyKey,
  });
  if (ctx.traceparent) headers["traceparent"] = ctx.traceparent;

  const res = await fetch(`${cfg.baseUrl}${path}`, { method: m, headers, body: rawBody, cache: "no-store" });
  const text = await res.text();
  let env: RailEnvelope<T>;
  try {
    env = text ? (JSON.parse(text) as RailEnvelope<T>) : { ok: res.ok };
  } catch {
    throw new RailError("Itafika", res.status, "RAIL_BAD_JSON", `Itafika: non-JSON response (${res.status})`);
  }
  if (!res.ok || env.ok === false) {
    const code = env.error?.code ?? `HTTP_${res.status}`;
    const message = env.error?.message ?? `Itafika call failed (${res.status})`;
    throw new RailError("Itafika", res.status, code, message, env.meta?.request_id);
  }
  return { data: env.data as T, requestId: env.meta?.request_id };
}

/** POST /v1/jobs/quote — price only, no job created. */
export async function quoteJob(input: QuoteInput, ctx: CallContext = {}): Promise<Quote> {
  return (await itafikaFetch<Quote>("POST", "/v1/jobs/quote", input, ctx)).data;
}

/** POST /v1/jobs — create a dispatch (idempotent via x-idempotency-key AND anchor_reference_id). */
export async function createJob(input: CreateJobInput, ctx: CallContext = {}): Promise<{ job: Job; requestId?: string }> {
  const { data, requestId } = await itafikaFetch<Job>("POST", "/v1/jobs", input, ctx);
  return { job: data, requestId };
}

/** GET /v1/jobs/{job_id} — fetch job state (bodyless GET; empty Content-Type signed). */
export async function getJob(jobId: string, ctx: CallContext = {}): Promise<Job> {
  return (await itafikaFetch<Job>("GET", `/v1/jobs/${encodeURIComponent(jobId)}`, undefined, ctx)).data;
}

/** POST /v1/jobs/{job_id}/cancel — cancel (POST, NOT DELETE; pre-DELIVERED only). */
export async function cancelJob(jobId: string, ctx: CallContext = {}): Promise<Job> {
  return (await itafikaFetch<Job>("POST", `/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {}, ctx)).data;
}
