import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processAgentDispatch, type AgentDispatchDeps } from "./dispatch";
import { DISPATCH_CODES, HELPAN_AGENT_ID, type AgentDispatchAction, type AgentInitiator } from "./types";

const NOW = 1_700_000_000_000;
const IDEM = "11111111-1111-4111-8111-111111111111"; // a valid UUIDv4 (the money anchor must be one)

function action(over: Partial<AgentDispatchAction> = {}): AgentDispatchAction {
  return {
    action_id: "act1",
    agent_id: HELPAN_AGENT_ID,
    account_uuid: "acc_1",
    kind: "checkout.auto_refill",
    authority: "tok",
    payload: { items: [{ id: "p1", quantity: 2 }], idempotency_key: IDEM },
    ...over,
  };
}

function mkDeps(over: Partial<AgentDispatchDeps> = {}): {
  deps: AgentDispatchDeps;
  placed: AgentInitiator[];
  checkedJti: string[];
} {
  const placed: AgentInitiator[] = [];
  const checkedJti: string[] = [];
  const deps: AgentDispatchDeps = {
    configured: true,
    verifyAuthority: async (_t, r) => ({
      ok: true,
      claims: {
        sub: r.accountUuid,
        agent_id: r.agentId,
        scopes: [r.requiredScope],
        operation_audience: r.expectedAudience,
        jti: "jtiX",
        exp: Math.floor(r.nowMs / 1000) + 300,
      },
    }),
    isAuthorityRevoked: async (jti) => {
      checkedJti.push(jti);
      return false;
    },
    placeAgentOrder: async (a, _claims, agent) => {
      placed.push(agent);
      return { charge_id: "chg_agent", external_ref: `ua_order_${a.payload.idempotency_key}` };
    },
    nowMs: NOW,
    ...over,
  };
  return { deps, placed, checkedJti };
}

describe("processAgentDispatch — fail-closed agent dispatch", () => {
  it("accepts a valid dispatch, executes stamped initiated_by:agent, and checks the TOKEN's jti", async () => {
    const { deps, placed, checkedJti } = mkDeps();
    const r = await processAgentDispatch(action(), deps);
    assert.equal(r.status, "accepted");
    assert.equal(r.charge_id, "chg_agent");
    assert.equal(r.external_ref, `ua_order_${IDEM}`);
    assert.deepEqual(placed, [{ initiated_by: "agent", agent_id: HELPAN_AGENT_ID }]);
    // Revocation MUST be keyed on the signature-verified token jti, never an envelope value.
    assert.deepEqual(checkedJti, ["jtiX"]);
  });

  it("unconfigured target → failed/TARGET_RAIL_UNCONFIGURED, never executes", async () => {
    const { deps, placed } = mkDeps({ configured: false });
    const r = await processAgentDispatch(action(), deps);
    assert.equal(r.status, "failed");
    assert.equal(r.code, DISPATCH_CODES.TARGET_RAIL_UNCONFIGURED);
    assert.equal(placed.length, 0);
  });

  it("rejects malformed actions before any authority work", async () => {
    assert.equal((await processAgentDispatch(action({ agent_id: "helpan-other-v1" }), mkDeps().deps)).code, DISPATCH_CODES.AUTHORITY_AGENT_MISMATCH);
    assert.equal((await processAgentDispatch(action({ kind: "checkout.something_else" }), mkDeps().deps)).code, DISPATCH_CODES.UNSUPPORTED_ACTION);
    assert.equal((await processAgentDispatch(action({ payload: { items: [], idempotency_key: IDEM } }), mkDeps().deps)).code, DISPATCH_CODES.INVALID_CART);
  });

  it("rejects a non-UUID idempotency_key (the money anchor must be globally unique)", async () => {
    assert.equal((await processAgentDispatch(action({ payload: { items: [{ id: "p1", quantity: 1 }], idempotency_key: "" } }), mkDeps().deps)).code, DISPATCH_CODES.INVALID_CART);
    assert.equal((await processAgentDispatch(action({ payload: { items: [{ id: "p1", quantity: 1 }], idempotency_key: "auto-refill-bob" } }), mkDeps().deps)).code, DISPATCH_CODES.INVALID_CART);
  });

  it("propagates the authority rejection code and never executes", async () => {
    const { deps, placed } = mkDeps({ verifyAuthority: async () => ({ ok: false, code: DISPATCH_CODES.AUTHORITY_EXPIRED }) });
    const r = await processAgentDispatch(action(), deps);
    assert.equal(r.status, "rejected");
    assert.equal(r.code, DISPATCH_CODES.AUTHORITY_EXPIRED);
    assert.equal(placed.length, 0);
  });

  it("rejects a revoked authority and never executes", async () => {
    const { deps, placed } = mkDeps({ isAuthorityRevoked: async () => true });
    const r = await processAgentDispatch(action(), deps);
    assert.equal(r.status, "rejected");
    assert.equal(r.code, DISPATCH_CODES.AUTHORITY_REVOKED);
    assert.equal(placed.length, 0);
  });

  it("a revocation-store error fails closed (never proceeds as not-revoked)", async () => {
    const { deps, placed } = mkDeps({
      isAuthorityRevoked: async () => {
        throw new Error("kv down");
      },
    });
    const r = await processAgentDispatch(action(), deps);
    assert.equal(r.status, "failed");
    assert.equal(r.code, DISPATCH_CODES.EXECUTION_FAILED);
    assert.equal(placed.length, 0);
  });

  it("an execution failure → failed/EXECUTION_FAILED", async () => {
    const { deps } = mkDeps({
      placeAgentOrder: async () => {
        throw new Error("KP down");
      },
    });
    const r = await processAgentDispatch(action(), deps);
    assert.equal(r.status, "failed");
    assert.equal(r.code, DISPATCH_CODES.EXECUTION_FAILED);
  });
});
