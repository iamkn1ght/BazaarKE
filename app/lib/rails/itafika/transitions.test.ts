import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideItafika } from "./transitions";

describe("decideItafika — forward-only delivery state machine", () => {
  it("job.assigned dispatches only from PAID and queues the shipping SMS", () => {
    const d = decideItafika("job.assigned", "PAID");
    assert.equal(d.kind, "apply");
    if (d.kind === "apply") {
      assert.equal(d.newState, "DISPATCHED");
      assert.deepEqual(d.sideEffects, [
        { kind: "notify", templateKey: "shipping_dispatched_sms", eventType: "shipping_dispatched" },
      ]);
    }
    for (const from of ["", "PENDING", "DISPATCHED", "DELIVERED"]) {
      assert.equal(decideItafika("job.assigned", from).kind, "skip");
    }
  });

  it("job.delivered completes from PAID or DISPATCHED with reconcile THEN notify (in order)", () => {
    for (const from of ["PAID", "DISPATCHED"]) {
      const d = decideItafika("job.delivered", from);
      assert.equal(d.kind, "apply");
      if (d.kind === "apply") {
        assert.equal(d.newState, "DELIVERED");
        assert.deepEqual(
          d.sideEffects.map((s) => s.kind),
          ["reconcile", "notify"],
        );
      }
    }
    for (const from of ["", "PENDING", "DELIVERED", "CANCELLED"]) {
      assert.equal(decideItafika("job.delivered", from).kind, "skip");
    }
  });

  it("job.cancelled cancels from PAID or DISPATCHED with no side effects, never after delivery", () => {
    for (const from of ["PAID", "DISPATCHED"]) {
      const d = decideItafika("job.cancelled", from);
      assert.equal(d.kind, "apply");
      if (d.kind === "apply") {
        assert.equal(d.newState, "CANCELLED");
        assert.deepEqual(d.sideEffects, []);
      }
    }
    for (const from of ["DELIVERED", "REFUNDED", ""]) {
      assert.equal(decideItafika("job.cancelled", from).kind, "skip");
    }
  });

  it("job.picked_up and job.failed are audit-only in every state", () => {
    for (const from of ["PAID", "DISPATCHED", "DELIVERED", ""]) {
      assert.equal(decideItafika("job.picked_up", from).kind, "audit");
      assert.equal(decideItafika("job.failed", from).kind, "audit");
    }
  });

  it("acks an unknown event name", () => {
    assert.equal(decideItafika("job.returned", "PAID").kind, "ack");
  });
});
