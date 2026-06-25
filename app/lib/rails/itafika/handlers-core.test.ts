import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processItafikaEvent, type ItafikaDeps, type OrderRow } from "./handlers-core";
import type { ItafikaWebhookEvent } from "./types";

interface Recorder {
  seen: string[];
  released: string[];
  commits: Array<{ set: Record<string, unknown>; action: string }>;
  notifies: Array<{ templateKey: string; idempotencyKey: string }>;
}

function mkDeps(
  opts: { order?: OrderRow | null; alreadySeen?: boolean; commitThrows?: boolean; notifyThrows?: boolean } = {},
): { deps: ItafikaDeps; rec: Recorder } {
  const rec: Recorder = { seen: [], released: [], commits: [], notifies: [] };
  const deps: ItafikaDeps = {
    seenBefore: async (k) => {
      rec.seen.push(k);
      return Boolean(opts.alreadySeen);
    },
    releaseDedup: async (k) => {
      rec.released.push(k);
    },
    findOrderByJob: async () => opts.order ?? null,
    commitOrder: async (_order, set, action) => {
      rec.commits.push({ set, action });
      if (opts.commitThrows) throw new Error("sanity down");
    },
    notifyAccount: async ({ templateKey, idempotencyKey }) => {
      rec.notifies.push({ templateKey, idempotencyKey });
      if (opts.notifyThrows) throw new Error("todoku down");
      return {};
    },
    notifyIdempotencyKey: (orderId, eventType) => `ua_${orderId}_${eventType}`,
  };
  return { deps, rec };
}

const ORDER: OrderRow = {
  _id: "order.ua_order_abc",
  account_uuid: "acc_1",
  business_op_id: "abc",
  delivery_fee_minor: 25000,
  traceparent: "tp1",
  state: "PAID",
};
function ev(over: Partial<ItafikaWebhookEvent> = {}): ItafikaWebhookEvent {
  return { event: "job.assigned", job_id: "job_1", state: "ASSIGNED", ...over };
}

describe("processItafikaEvent — orchestration", () => {
  it("job.assigned from PAID: DISPATCHED write + shipping SMS, claim kept", async () => {
    const { deps, rec } = mkDeps({ order: { ...ORDER, state: "PAID" } });
    await processItafikaEvent(ev(), deps);
    assert.deepEqual(rec.commits[0].set, { state: "DISPATCHED" });
    assert.equal(rec.commits[0].action, "job.assigned");
    assert.deepEqual(rec.notifies.map((n) => n.templateKey), ["shipping_dispatched_sms"]);
    assert.equal(rec.notifies[0].idempotencyKey, "ua_abc_shipping_dispatched");
    assert.equal(rec.released.length, 0);
  });

  it("job.assigned from a non-PAID state is skipped: no write, no notify", async () => {
    const { deps, rec } = mkDeps({ order: { ...ORDER, state: "PENDING" } });
    await processItafikaEvent(ev(), deps);
    assert.equal(rec.commits.length, 0);
    assert.equal(rec.notifies.length, 0);
    assert.equal(rec.released.length, 0);
  });

  it("job.delivered from DISPATCHED: DELIVERED write + delivery SMS (reconcile logs, doesn't notify twice)", async () => {
    const { deps, rec } = mkDeps({ order: { ...ORDER, state: "DISPATCHED" } });
    await processItafikaEvent(ev({ event: "job.delivered" }), deps);
    assert.deepEqual(rec.commits[0].set, { state: "DELIVERED" });
    assert.deepEqual(rec.notifies.map((n) => n.templateKey), ["delivery_completed_sms"]);
  });

  it("job.cancelled after DELIVERED is skipped (never un-deliver)", async () => {
    const { deps, rec } = mkDeps({ order: { ...ORDER, state: "DELIVERED" } });
    await processItafikaEvent(ev({ event: "job.cancelled" }), deps);
    assert.equal(rec.commits.length, 0);
  });

  it("job.picked_up is audit-only: empty-set write, no notify", async () => {
    const { deps, rec } = mkDeps({ order: { ...ORDER, state: "DISPATCHED" } });
    await processItafikaEvent(ev({ event: "job.picked_up" }), deps);
    assert.equal(rec.commits.length, 1);
    assert.deepEqual(rec.commits[0].set, {});
    assert.equal(rec.commits[0].action, "job.picked_up");
    assert.equal(rec.notifies.length, 0);
  });

  it("an unknown event is rejected BEFORE the dedup claim (no seen, no write)", async () => {
    const { deps, rec } = mkDeps({ order: { ...ORDER, state: "PAID" } });
    await processItafikaEvent(ev({ event: "job.returned" }), deps);
    assert.equal(rec.seen.length, 0);
    assert.equal(rec.commits.length, 0);
  });

  it("a missing order is acked after claiming dedup: no write, claim kept", async () => {
    const { deps, rec } = mkDeps({ order: null });
    await processItafikaEvent(ev(), deps);
    assert.equal(rec.seen.length, 1);
    assert.equal(rec.commits.length, 0);
    assert.equal(rec.released.length, 0);
  });

  it("commit failure releases the dedup claim and rethrows", async () => {
    const { deps, rec } = mkDeps({ order: { ...ORDER, state: "PAID" }, commitThrows: true });
    await assert.rejects(() => processItafikaEvent(ev(), deps), /sanity down/);
    assert.equal(rec.released.length, 1);
    assert.equal(rec.notifies.length, 0);
  });

  it("a notify failure is swallowed: state write kept, claim NOT released", async () => {
    const { deps, rec } = mkDeps({ order: { ...ORDER, state: "PAID" }, notifyThrows: true });
    await processItafikaEvent(ev(), deps);
    assert.equal(rec.commits.length, 1);
    assert.equal(rec.released.length, 0);
  });
});
