/**
 * Smoke test for the Itafika client: quote -> create -> get. Mirrors the recipe in
 * RAIL_INTEGRATION_PLAYBOOK §3.4. Asserts a 201/created job in state PENDING_ASSIGNMENT.
 *
 * Run: node --conditions=react-server --import tsx scripts/smoke-itafika.ts
 * Requires: ITAFIKA_BASE_URL, ITAFIKA_APP_ID=unique_accessories, ITAFIKA_APP_SECRET (hex-64).
 * Itafika dev is deployed; this can run once Silvia provisions the unique_accessories anchor + secret.
 */
import { randomUUID } from "crypto";
import { createJob, getJob, quoteJob } from "../app/lib/rails/itafika/client";
import type { GeoPoint } from "../app/lib/rails/itafika/types";

const origin: GeoPoint = { lat: -1.2921, lng: 36.8219, label: "UA store (Nairobi CBD)" };
const destination: GeoPoint = { lat: -1.2633, lng: 36.8035, label: "Westlands" };
const distance_meters = 4200;

async function main(): Promise<void> {
  console.log("1) POST /v1/jobs/quote");
  const quote = await quoteJob({ origin, destination, distance_meters, tier: "standard" });
  console.log(`   price_minor=${quote.price_minor} rider_payout_minor=${quote.rider_payout_minor} move_take_minor=${quote.move_take_minor}`);

  const anchorRef = `ua_order_smoke_${randomUUID()}`;
  console.log("2) POST /v1/jobs (create)");
  const { job } = await createJob({ anchor_reference_id: anchorRef, origin, destination, distance_meters, tier: "standard" }, { idempotencyKey: anchorRef });
  console.log(`   job_id=${job.job_id} state=${job.state}`);
  if (job.state !== "PENDING_ASSIGNMENT") throw new Error(`unexpected initial state: ${job.state}`);

  console.log("3) GET /v1/jobs/{id} (bodyless GET — empty Content-Type)");
  const fetched = await getJob(job.job_id);
  console.log(`   state=${fetched.state}`);

  console.log("\nSMOKE OK (job created)");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
