import "server-only";
import { client } from "@/app/lib/sanity";
import { getWriteClient } from "@/app/lib/sanity-write";
import { initiateCharge } from "../payment-rail/client";
import { newTraceparent } from "../_shared/trace";
import { RailError } from "../_shared/railFetch";
import { verifyAuthority, type AuthorityKeyResolver } from "./authority";
import { isAuthorityRevoked } from "./revocation";
import { helpanConfigured } from "./client";
import { processAgentDispatch, type PlacedAgentOrder } from "./dispatch";
import type { AgentDispatchAction, AgentInitiator, DelegatedAuthorityClaims, DispatchResult } from "./types";

/**
 * Helpan agent-dispatch SHELL (server-only). Wires the real authority verification, revocation store,
 * and KP charge into the pure core (dispatch.ts). Nothing here acts until the rails are provisioned —
 * the JWKS resolver below is inert, so `verifyAuthority` fails closed today.
 */

const MAX_QTY_PER_LINE = 1000;

interface PriceRow {
  _id: string;
  name?: string;
  price_minor?: number;
  price?: number;
}

/** Authoritative price = Sanity price_minor (fall back to legacy price*100). Never trust the agent. */
function priceMinorOf(row: PriceRow): number {
  if (typeof row.price_minor === "number" && Number.isInteger(row.price_minor)) return row.price_minor;
  if (typeof row.price === "number") return Math.round(row.price * 100);
  return 0;
}

/**
 * Resolve the Identiti JWKS public key for a delegated-authority JWT `kid`. INERT (returns null) until
 * Identiti's `/.well-known/jwks.json` is reachable (ID-14) and Helpan Stage-1 publishes the DA key —
 * so every authority verification fails CLOSED today. Wire the fetch+cache here when those land.
 */
const inertAuthorityKeyResolver: AuthorityKeyResolver = async () => null;

/** Execute an agent auto-refill: price from Sanity, create the order (initiated_by:"agent"), charge KP. */
async function executeAgentCheckout(
  action: AgentDispatchAction,
  claims: DelegatedAuthorityClaims,
  agent: AgentInitiator,
): Promise<PlacedAgentOrder> {
  const idemKey = action.payload.idempotency_key;
  const externalRef = `ua_order_${idemKey}`;
  const orderDocId = `order.${externalRef}`;
  const writeClient = getWriteClient();

  // Idempotent short-circuit: this action already produced a charge — return it, don't charge again.
  // Defense-in-depth against an idempotency-key reuse across accounts: never hand back a charge that
  // belongs to a DIFFERENT buyer (the UUID gate in dispatch.ts already makes a collision near-impossible).
  const existing = (await writeClient.getDocument(orderDocId)) as { kp_charge_id?: string; account_uuid?: string } | undefined;
  if (existing?.kp_charge_id) {
    if (existing.account_uuid && existing.account_uuid !== claims.sub) {
      throw new Error("idempotency_key already bound to a different account");
    }
    return { charge_id: existing.kp_charge_id, external_ref: externalRef };
  }

  // Recompute the total from Sanity (authoritative) — never trust agent-supplied prices/quantities.
  const lines = action.payload.items
    .filter((l) => l && typeof l.id === "string" && Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= MAX_QTY_PER_LINE)
    .map((l) => ({ id: l.id, quantity: l.quantity }));
  if (lines.length === 0) throw new Error("agent cart is empty or invalid after validation");

  const rows = await client.fetch<PriceRow[]>(
    `*[_type == "product" && _id in $ids]{ _id, name, price_minor, price }`,
    { ids: lines.map((l) => l.id) },
  );
  const byId = new Map(rows.map((r) => [r._id, r]));
  let totalMinor = 0;
  const items: Array<{ name: string; quantity: number; unit_price_minor: number }> = [];
  for (const line of lines) {
    const row = byId.get(line.id);
    if (!row) throw new Error(`unknown product: ${line.id}`);
    const unit = priceMinorOf(row);
    if (unit <= 0) throw new Error(`product ${row.name ?? line.id} is not priced for checkout`);
    totalMinor += unit * line.quantity;
    items.push({ name: row.name ?? line.id, quantity: line.quantity, unit_price_minor: unit });
  }
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw new Error("agent order total is out of range");

  const traceparent = newTraceparent();
  await writeClient.createIfNotExists({
    _id: orderDocId,
    _type: "order",
    state: "PENDING",
    account_uuid: claims.sub,
    initiated_by: agent.initiated_by, // "agent"
    agent_id: agent.agent_id,
    currency: "KES",
    total_minor: totalMinor,
    business_op_id: idemKey,
    traceparent,
    items,
  });

  // KP charge on the buyer's behalf. The agent attribution is recorded in our order + audit row
  // (the cross-rail trail §4); a payout/refund >= KES 10,000 still requires an Identiti step-up — no
  // agent path bypasses the Money Rule.
  let charge;
  let requestId: string | undefined;
  try {
    const result = await initiateCharge(
      {
        account_uuid: claims.sub,
        amount_minor: totalMinor,
        currency: "KES",
        purpose: "order_purchase",
        external_ref: externalRef,
        idempotency_key: idemKey,
      },
      { traceparent, idempotencyKey: idemKey },
    );
    charge = result.charge;
    requestId = result.requestId;
  } catch (chargeErr) {
    // Don't leave an orphan PENDING agent order: mark it FAILED with an audit row, then surface it
    // (the dispatch core turns the throw into failed/EXECUTION_FAILED). Mirrors the human route.
    await writeClient
      .patch(orderDocId)
      .setIfMissing({ rail_audit: [] })
      .set({ state: "FAILED" })
      .append("rail_audit", [
        {
          rail: "kipkiren_pay",
          action: "charge.initiate",
          traceparent,
          business_op_id: idemKey,
          initiated_by: agent.initiated_by,
          agent_id: agent.agent_id,
          timestamp: new Date().toISOString(),
          success: false,
          error_code: chargeErr instanceof RailError ? chargeErr.code : "CHARGE_FAILED",
        },
      ])
      .commit({ autoGenerateArrayKeys: true })
      .catch(() => {});
    throw chargeErr;
  }

  await writeClient
    .patch(orderDocId)
    .setIfMissing({ rail_audit: [] })
    .set({ kp_charge_id: charge.charge_id })
    .append("rail_audit", [
      {
        rail: "kipkiren_pay",
        action: "charge.initiate",
        traceparent,
        business_op_id: idemKey,
        request_id: requestId,
        initiated_by: agent.initiated_by,
        agent_id: agent.agent_id,
        timestamp: new Date().toISOString(),
        success: true,
      },
    ])
    .commit({ autoGenerateArrayKeys: true });

  return { charge_id: charge.charge_id, external_ref: externalRef };
}

/** Process a Helpan dispatch end-to-end with the real I/O. Never throws — returns a DispatchResult. */
export async function dispatchAgentCheckout(action: AgentDispatchAction): Promise<DispatchResult> {
  return processAgentDispatch(action, {
    configured: helpanConfigured(),
    verifyAuthority: (token, req) => verifyAuthority(token, inertAuthorityKeyResolver, req),
    isAuthorityRevoked,
    placeAgentOrder: executeAgentCheckout,
    nowMs: Date.now(),
  });
}
