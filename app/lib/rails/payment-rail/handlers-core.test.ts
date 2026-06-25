import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processKpEvent, type KpDeps, type OrderSnapshot } from "./handlers-core";
import type { KpEvent } from "./types";

interface Recorder {
  seen: string[];
  released: string[];
  commits: Array<{ externalRef: string; set: Record<string, unknown>; action: string }>;
  notifies: Array<{ templateKey: string; idempotencyKey: string }>;
  dispatches: Array<{ externalRef: string; traceparent?: string }>;
}

function mkDeps(
  opts: {
    order?: OrderSnapshot | null;
    alreadySeen?: boolean;
    commitThrows?: boolean;
    notifyThrows?: boolean;
    dispatchThrows?: boolean;
  } = {},
): { deps: KpDeps; rec: Recorder } {
  const rec: Recorder = { seen: [], released: [], commits: [], notifies: [], dispatches: [] };
  const deps: KpDeps = {
    seenBefore: async (k) => {
      rec.seen.push(k);
      return Boolean(opts.alreadySeen);
    },
    releaseDedup: async (k) => {
      rec.released.push(k);
    },
    loadOrder: async () => opts.order ?? null,
    commitOrder: async (externalRef, _snap, set, action) => {
      rec.commits.push({ externalRef, set, action });
      if (opts.commitThrows) throw new Error("sanity down");
    },
    notifyAccount: async ({ templateKey, idempotencyKey }) => {
      rec.notifies.push({ templateKey, idempotencyKey });
      if (opts.notifyThrows) throw new Error("todoku down");
      return {};
    },
    notifyIdempotencyKey: (orderId, eventType) => `ua_${orderId}_${eventType}`,
    dispatchDelivery: async (externalRef, traceparent) => {
      rec.dispatches.push({ externalRef, traceparent });
      if (opts.dispatchThrows) throw new Error("itafika down");
    },
  };
  return { deps, rec };
}

const REF = "ua_order_abc";
function ev(over: Partial<KpEvent> = {}): KpEvent {
  return {
    event_type: "PAYMENT_COMPLETED",
    external_ref: REF,
    charge_id: "chg_1",
    amount_minor: "150000",
    account_uuid: "acc_1",
    ...over,
  };
}

describe("processKpEvent — orchestration", () => {
  it("PAYMENT_COMPLETED from PENDING: one PAID write with charge id, then sms+whatsapp+dispatch, claim kept", async () => {
    const { deps, rec } = mkDeps({ order: { state: "PENDING", traceparent: "tp1" } });
    await processKpEvent(ev(), deps);
    assert.equal(rec.commits.length, 1);
    assert.deepEqual(rec.commits[0].set, { state: "PAID", kp_charge_id: "chg_1" });
    assert.equal(rec.commits[0].action, "payment.completed");
    assert.deepEqual(rec.notifies.map((n) => n.templateKey), ["order_confirmed_sms", "order_confirmed_whatsapp"]);
    assert.equal(rec.notifies[0].idempotencyKey, "ua_abc_order_confirmed_sms");
    assert.equal(rec.dispatches.length, 1);
    assert.equal(rec.dispatches[0].traceparent, "tp1");
    assert.equal(rec.released.length, 0); // success → claim retained
  });

  it("PAYMENT_COMPLETED replay on an already-PAID order: no write, no side effects, claim kept (no double-fire)", async () => {
    const { deps, rec } = mkDeps({ order: { state: "PAID" } });
    await processKpEvent(ev(), deps);
    assert.equal(rec.commits.length, 0);
    assert.equal(rec.notifies.length, 0);
    assert.equal(rec.dispatches.length, 0);
    assert.equal(rec.released.length, 0);
  });

  it("a duplicate (dedup already claimed) short-circuits before any work", async () => {
    const { deps, rec } = mkDeps({ order: { state: "PENDING" }, alreadySeen: true });
    await processKpEvent(ev(), deps);
    assert.equal(rec.seen.length, 1);
    assert.equal(rec.commits.length, 0);
  });

  it("commit failure releases the dedup claim and rethrows (claim-then-crash recovery), before any side effect", async () => {
    const { deps, rec } = mkDeps({ order: { state: "PENDING" }, commitThrows: true });
    await assert.rejects(() => processKpEvent(ev(), deps), /sanity down/);
    assert.equal(rec.commits.length, 1);
    assert.equal(rec.released.length, 1);
    assert.equal(rec.notifies.length, 0);
    assert.equal(rec.dispatches.length, 0);
  });

  it("a Todoku notify failure is swallowed: state write kept, dispatch still runs, claim NOT released", async () => {
    const { deps, rec } = mkDeps({ order: { state: "PENDING" }, notifyThrows: true });
    await processKpEvent(ev(), deps); // must not throw
    assert.equal(rec.commits.length, 1);
    assert.equal(rec.notifies.length, 2); // both attempted despite throwing
    assert.equal(rec.dispatches.length, 1);
    assert.equal(rec.released.length, 0);
  });

  it("a dispatch failure is swallowed: no throw, state write kept, claim NOT released", async () => {
    const { deps, rec } = mkDeps({ order: { state: "PENDING" }, dispatchThrows: true });
    await processKpEvent(ev(), deps);
    assert.equal(rec.commits.length, 1);
    assert.equal(rec.released.length, 0);
  });

  it("PAYOUT_COMPLETED from PAID: REFUNDED write + refund SMS only", async () => {
    const { deps, rec } = mkDeps({ order: { state: "PAID" } });
    await processKpEvent(ev({ event_type: "PAYOUT_COMPLETED", payout_id: "po_1" }), deps);
    assert.deepEqual(rec.commits[0].set, { state: "REFUNDED" });
    assert.deepEqual(rec.notifies.map((n) => n.templateKey), ["refund_initiated_sms"]);
    assert.equal(rec.dispatches.length, 0);
  });

  it("PAYOUT_FAILED is audit-only: an empty-set audit write, no side effects", async () => {
    const { deps, rec } = mkDeps({ order: { state: "PAID" } });
    await processKpEvent(ev({ event_type: "PAYOUT_FAILED", payout_id: "po_1" }), deps);
    assert.equal(rec.commits.length, 1);
    assert.deepEqual(rec.commits[0].set, {});
    assert.equal(rec.commits[0].action, "payout.failed");
    assert.equal(rec.notifies.length, 0);
  });

  it("an event with no external_ref is acked (dedup claimed on charge_id), no write", async () => {
    const { deps, rec } = mkDeps({ order: null });
    await processKpEvent(ev({ external_ref: undefined }), deps);
    assert.equal(rec.commits.length, 0);
    assert.equal(rec.seen.length, 1);
    assert.equal(rec.seen[0], "dedup:kp:PAYMENT_COMPLETED:chg_1");
    assert.equal(rec.released.length, 0);
  });
});
