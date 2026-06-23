/**
 * Smoke test for the Identiti rail client — mirrors the rail-side smoke recipe
 * (RAIL_INTEGRATION_PLAYBOOK.md §3.4 / KMV guide §11): create customer -> token -> phone-token
 * -> tier -> step-up challenge.
 *
 * BLOCKED until the `unique_accessories_sandbox` HMAC secret is delivered (4th in the operator
 * queue behind 3 stale Identiti secrets — master RECAP §8 item 1).
 *
 * Run (the --conditions flag stops the `server-only` guard from throwing under tsx/node):
 *   npx tsx --conditions=react-server scripts/smoke-identiti.ts
 *
 * Requires env: IDENTITI_API_BASE, IDENTITI_APP_ID, IDENTITI_APP_SECRET (hex-64).
 */
import {
  createCustomer,
  createStepUpChallenge,
  getCustomerTier,
  issueCustomerToken,
  mintPhoneToken,
} from "../app/lib/rails/identiti";

async function main(): Promise<void> {
  const stamp = Date.now();
  console.log("1) POST /v1/customers");
  const customer = await createCustomer({
    phone: "+254700000005",
    name_first: "Smoke",
    name_last: "Test",
    app_correlation: `unique_accessories_smoke_${stamp}`,
    consent: {
      dpa_consent: true,
      kyc_consent: true,
      marketing_consent: false,
      captured_at: new Date().toISOString(),
      captured_via: "app_onboarding",
    },
  });
  console.log(`   account_uuid=${customer.account_uuid} state=${customer.state} tier=${customer.tier}`);

  console.log("2) POST /v1/auth/customer-token (aud=unique_accessories)");
  const token = await issueCustomerToken(customer.account_uuid);
  console.log(`   token.len=${token.token.length} expires_in=${token.expires_in}`);

  console.log("3) POST /v1/phone-tokens (audience=todoku)");
  const phoneToken = await mintPhoneToken(customer.account_uuid);
  console.log(`   jti=${phoneToken.jti} audience=${phoneToken.audience}`);

  console.log("4) GET /v1/customers/{uuid}/tier");
  const tier = await getCustomerTier(customer.account_uuid);
  console.log(`   tier=${tier}`);

  console.log("5) POST /v1/stepup/challenges (kipkiren_pay.payout.initiate)");
  const challenge = await createStepUpChallenge({
    account_uuid: customer.account_uuid,
    operation_audience: "kipkiren_pay",
    operation_kind: "kipkiren_pay.payout.initiate",
    operation_risk_tier: "high",
    factor: "phone_otp",
  });
  console.log(
    `   challenge_id=${challenge.challenge_id}` +
      (challenge.sandbox_only ? ` (sandbox otp=${challenge.otp_plaintext})` : ""),
  );

  console.log("\nSMOKE OK");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
