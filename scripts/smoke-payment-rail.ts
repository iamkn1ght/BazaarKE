/**
 * Smoke test for the Kipkiren Pay client. BLOCKED until KP-1-Ops deploys
 * (PAYMENT_RAIL_API_BASE is TBD; pay.kipkiren.co.ke does not resolve yet).
 *
 * Run: node --conditions=react-server --import tsx scripts/smoke-payment-rail.ts
 * Requires: PAYMENT_RAIL_API_BASE, PAYMENT_RAIL_APP_ID, PAYMENT_RAIL_APP_SECRET (base64url-43),
 *           ACCOUNT_UUID (a sandbox Identiti account_uuid).
 *
 * Sandbox quirk: Daraja sandbox MSISDN 254708374149 returns ResultCode 1037 (DS timeout), not
 * success — the COMPLETED path needs KP-synthesized callbacks (KMV guide §6). This smoke asserts
 * the charge is CREATED (charge_id returned), not COMPLETED.
 */
import { randomUUID } from "crypto";
import { getCharge, initiateCharge } from "../app/lib/rails/payment-rail/client";

async function main(): Promise<void> {
  const accountUuid = process.env.ACCOUNT_UUID;
  if (!accountUuid) {
    throw new Error("Set ACCOUNT_UUID (a sandbox Identiti account_uuid) to run this smoke.");
  }
  const orderId = randomUUID();

  console.log("1) POST /v1/charges/initiate (amount_minor=5000 == KES 50)");
  const charge = await initiateCharge({
    account_uuid: accountUuid,
    amount_minor: 5000,
    currency: "KES",
    purpose: "order_purchase",
    external_ref: `ua_order_smoke_${orderId}`,
    idempotency_key: orderId,
  });
  console.log(`   charge_id=${charge.charge_id} status=${charge.status}`);
  if (!charge.charge_id) throw new Error("no charge_id returned");

  console.log("2) GET /v1/charges/{id}");
  const got = await getCharge(charge.charge_id);
  console.log(`   status=${got.status} (sandbox 254708374149 -> 1037; may stay PENDING)`);

  console.log("\nSMOKE OK (charge created)");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
