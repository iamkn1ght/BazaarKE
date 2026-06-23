/**
 * Sanity data migration: PayPal-era catalog/orders -> rail-aligned (Kipkiren Pay) shape.
 *
 * Signed Day-0 gates this implements (OPERATOR_REQUEST_CHAMIA.md):
 *  - CHAMIA-CURRENCY: re-price the catalog DIRECTLY in KES minor units. No FX rate is applied.
 *    The existing `price` number is interpreted as the intended KES major-unit amount, so
 *    price_minor = round(price * 100). Products with no usable price are reported for manual
 *    re-pricing rather than guessed.
 *  - CHAMIA-DATASET-CLEANUP: tag legacy PayPal `order` docs with legacy:'paypal' (do NOT drop).
 *  - CHAMIA-SANITY-DATASET: dataset defaults to 'sanityyy' (matches app/lib/sanity.ts).
 *
 * SAFE BY DEFAULT: dry-run unless invoked with --apply. Requires SANITY_API_TOKEN (write access).
 *   Dry run:  npx tsx scripts/migrate-sanity-paypal-to-kp.ts
 *   Apply:    npx tsx scripts/migrate-sanity-paypal-to-kp.ts --apply
 */
import { createClient } from "next-sanity";

const apply = process.argv.includes("--apply");

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "d0fzn4cs";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "sanityyy";
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION ?? "2022-03-25";
const token = process.env.SANITY_API_TOKEN;

if (!token) {
  console.error("SANITY_API_TOKEN is required (write access). Aborting.");
  process.exit(1);
}

const client = createClient({ projectId, dataset, apiVersion, token, useCdn: false });

interface ProductRow {
  _id: string;
  name?: string;
  price?: number;
  price_minor?: number;
}

interface OrderRow {
  _id: string;
  legacy?: string;
  paypalOrderId?: string;
}

function kesMajorToMinor(major: number): number {
  return Math.round(major * 100);
}

async function migrateProducts(): Promise<void> {
  const products = await client.fetch<ProductRow[]>(
    `*[_type == "product"]{ _id, name, price, price_minor }`,
  );
  console.log(`\n[products] ${products.length} found`);

  const needsManual: string[] = [];
  let toSet = 0;

  for (const p of products) {
    if (typeof p.price_minor === "number") {
      continue; // already migrated
    }
    if (typeof p.price !== "number" || p.price <= 0) {
      needsManual.push(`${p._id} (${p.name ?? "unnamed"})`);
      continue;
    }
    const priceMinor = kesMajorToMinor(p.price);
    toSet += 1;
    console.log(`  ${apply ? "SET " : "DRY "} ${p._id} (${p.name ?? "unnamed"}): price=${p.price} -> price_minor=${priceMinor}`);
    if (apply) {
      await client.patch(p._id).set({ price_minor: priceMinor }).commit();
    }
  }

  console.log(`[products] ${toSet} ${apply ? "updated" : "would update"}; ${needsManual.length} need manual re-pricing`);
  if (needsManual.length) {
    console.log("  MANUAL RE-PRICE (no usable price):");
    needsManual.forEach((id) => console.log(`    - ${id}`));
  }
}

async function tagLegacyOrders(): Promise<void> {
  // Any order that looks PayPal-era (has paypalOrderId) and isn't already tagged.
  const orders = await client.fetch<OrderRow[]>(
    `*[_type == "order" && defined(paypalOrderId) && !defined(legacy)]{ _id, legacy, paypalOrderId }`,
  );
  console.log(`\n[orders] ${orders.length} legacy PayPal order(s) to tag`);
  for (const o of orders) {
    console.log(`  ${apply ? "TAG " : "DRY "} ${o._id} -> legacy:'paypal'`);
    if (apply) {
      await client.patch(o._id).set({ legacy: "paypal" }).commit();
    }
  }
}

async function main(): Promise<void> {
  console.log(`Sanity migration | project=${projectId} dataset=${dataset} | mode=${apply ? "APPLY" : "DRY-RUN"}`);
  await migrateProducts();
  await tagLegacyOrders();
  console.log(`\nDone (${apply ? "applied" : "dry-run — re-run with --apply to write"}).`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
