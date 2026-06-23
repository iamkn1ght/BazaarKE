import "server-only";

/**
 * Webhook/event dedup store. Money Rule: main-loop only.
 *
 * Backed by Vercel KV (Upstash Redis) — NOT Sanity. Sanity is eventually consistent
 * (~200-800ms; read-after-write not guaranteed), so two parallel webhook/event retries can
 * both see "no dedup row" and double-process (double-charge / double-dispatch). KV set-if-absent
 * is atomic. Key shape: dedup:<rail>:<event_type>:<idempotency_key>; TTL = 300s replay + margin.
 */

const TTL_SECONDS = 600;

export function dedupKey(rail: string, eventType: string, idempotencyKey: string): string {
  return `dedup:${rail}:${eventType}:${idempotencyKey}`;
}

function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

// Dev-only fallback — per-process memory, NOT safe across serverless invocations.
const memory = new Map<string, number>();

/**
 * Returns true if `key` was already processed (duplicate — skip), false if new (proceed).
 * Atomic via KV set-if-absent. Falls back to in-memory in dev (warns in production).
 */
export async function seenBefore(key: string, ttlSeconds: number = TTL_SECONDS): Promise<boolean> {
  if (kvConfigured()) {
    const { kv } = await import("@vercel/kv");
    const res = await kv.set(key, "1", { nx: true, ex: ttlSeconds });
    return res === null; // null => key already existed => duplicate
  }

  if (process.env.NODE_ENV === "production") {
    console.warn("[dedup] Vercel KV not configured in production — webhook dedup is NOT reliable across instances.");
  }
  const now = Date.now();
  for (const [k, expiry] of memory) {
    if (expiry < now) memory.delete(k);
  }
  if (memory.has(key)) return true;
  memory.set(key, now + ttlSeconds * 1000);
  return false;
}
