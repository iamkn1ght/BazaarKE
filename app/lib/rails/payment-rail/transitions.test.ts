import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideKp } from "./transitions";

describe("decideKp — forward-only KP order state machine", () => {
  it("PAYMENT_COMPLETED applies PAID from a new/pending order, stamps the charge, and queues sms+whatsapp+dispatch", () => {
    for (const from of ["", "PENDING"]) {
      const d = decideKp("PAYMENT_COMPLETED", from);
      assert.equal(d.kind, "apply");
      if (d.kind !== "apply") return;
      assert.equal(d.newState, "PAID");
      assert.equal(d.setChargeId, true);
      assert.deepEqual(
        d.sideEffects.map((s) => (s.kind === "notify" ? s.templateKey : s.kind)),
        ["order_confirmed_sms", "order_confirmed_whatsapp", "dispatch"],
      );
    }
  });

  it("PAYMENT_COMPLETED on an already-PAID/terminal order is skipped — no double-charge/notify/dispatch on replay", () => {
    for (const from of ["PAID", "DISPATCHED", "DELIVERED", "REFUNDED", "FAILED", "CANCELLED"]) {
      assert.equal(decideKp("PAYMENT_COMPLETED", from).kind, "skip");
    }
  });

  it("PAYMENT_FAILED applies FAILED only from new/pending, no side effects, never stamps a charge", () => {
    const d = decideKp("PAYMENT_FAILED", "PENDING");
    assert.equal(d.kind, "apply");
    if (d.kind === "apply") {
      assert.equal(d.newState, "FAILED");
      assert.equal(d.setChargeId, false);
      assert.deepEqual(d.sideEffects, []);
    }
    assert.equal(decideKp("PAYMENT_FAILED", "PAID").kind, "skip"); // cannot fail a paid order
  });

  it("PAYOUT_COMPLETED refunds only from PAID/DISPATCHED/DELIVERED and notifies the refund", () => {
    for (const from of ["PAID", "DISPATCHED", "DELIVERED"]) {
      const d = decideKp("PAYOUT_COMPLETED", from);
      assert.equal(d.kind, "apply");
      if (d.kind === "apply") {
        assert.equal(d.newState, "REFUNDED");
        assert.deepEqual(d.sideEffects, [
          { kind: "notify", templateKey: "refund_initiated_sms", eventType: "refund_initiated" },
        ]);
      }
    }
    for (const from of ["", "PENDING", "REFUNDED"]) {
      assert.equal(decideKp("PAYOUT_COMPLETED", from).kind, "skip");
    }
  });

  it("PAYOUT_FAILED and WALLET_CREDITED are audit-only in every state", () => {
    for (const from of ["", "PENDING", "PAID", "DISPATCHED", "REFUNDED"]) {
      assert.equal(decideKp("PAYOUT_FAILED", from).kind, "audit");
      assert.equal(decideKp("WALLET_CREDITED", from).kind, "audit");
    }
  });

  it("acks an unknown / unsubscribed event type", () => {
    assert.equal(decideKp("CHARGE_REVERSED", "PAID").kind, "ack");
    assert.equal(decideKp("", "PAID").kind, "ack");
  });
});
