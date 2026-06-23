/**
 * Smoke test for the Todoku client: send -> poll status.
 * Run: node --conditions=react-server --import tsx scripts/smoke-todoku.ts
 * Requires: TODOKU_API_BASE, TODOKU_APP_ID, TODOKU_APP_SECRET (base64url-43), and at least one
 * delivered template ULID (TODOKU_TPL_ORDER_CONFIRMED_SMS). Blocked until Silvia provisions the
 * unique_accessories tenant + template ULIDs.
 *
 * Sandbox quirk: Todoku sandbox rejects real Identiti sandbox JWTs with CHAN_PHONE_TOKEN_INVALID,
 * so this uses a synthesized SANDBOX_TOKEN_DELIVER_OK_* recipient_token (no Identiti call).
 */
import { randomUUID } from "crypto";
import { getMessage, sendMessage } from "../app/lib/rails/todoku/client";
import { templateId } from "../app/lib/rails/todoku/templates";

async function main(): Promise<void> {
  const recipientToken = `SANDBOX_TOKEN_DELIVER_OK_unique_accessories_smoke_${randomUUID()}`;
  const idempotencyKey = `ua_smoke_${randomUUID()}_order_confirmed_sms`;

  console.log("1) POST /v1/messages/send (sandbox synth recipient_token)");
  const sent = await sendMessage({
    recipient_token: recipientToken,
    template_id: templateId("order_confirmed_sms"),
    template_variables: { order_ref: "ua_order_smoke", amount: "KES 50.00" },
    channel: "sms",
    idempotency_key: idempotencyKey,
  });
  console.log(`   message_id=${sent.message_id} status=${sent.status}`);
  if (!sent.message_id) throw new Error("no message_id returned");

  console.log("2) GET /v1/messages/{id}");
  const status = await getMessage(sent.message_id);
  console.log(`   status=${status.status}`);

  console.log("\nSMOKE OK (message accepted)");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
