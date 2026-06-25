import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBroadcastInput,
  buildEntityInput,
  filterToVertical,
  priceRangeKes,
  type ProductForHakken,
} from "./broadcasts";
import { BROADCAST_TTL_MAX_MS, HAKKEN_VERTICAL } from "./types";

const NOW = 1_700_000_000_000;

describe("priceRangeKes — band, never the exact price", () => {
  it("brackets a price into an integer-minor-units band that contains it", () => {
    const [lo, hi] = priceRangeKes(75000); // KES 750
    assert.ok(Number.isInteger(lo) && Number.isInteger(hi));
    assert.ok(lo <= 75000 && 75000 < hi, `expected band to contain 75000, got [${lo}, ${hi}]`);
    assert.notEqual(lo, 75000); // never reveals the exact price as a bound
  });

  it("keeps the price STRICTLY interior — neither bound equals it, even for round/on-edge prices", () => {
    // Every bucket edge (in minor units) — the common round retail points that previously leaked.
    const edgeMinor = [10000, 25000, 50000, 100000, 200000, 350000, 500000, 750000, 1000000, 2000000, 5000000];
    for (const p of [...edgeMinor, 75000, 333300, 4999900]) {
      const [lo, hi] = priceRangeKes(p);
      assert.ok(Number.isInteger(lo) && Number.isInteger(hi));
      assert.notEqual(lo, p, `lower bound leaked exact price ${p} (band [${lo}, ${hi}])`);
      assert.notEqual(hi, p, `upper bound leaked exact price ${p} (band [${lo}, ${hi}])`);
      assert.ok(lo < p && p < hi, `price ${p} not strictly interior to [${lo}, ${hi}]`);
    }
  });

  it("handles zero / negative / non-finite as the lowest band", () => {
    assert.deepEqual(priceRangeKes(0), [0, 10000]);
    assert.deepEqual(priceRangeKes(-5), [0, 10000]);
    assert.deepEqual(priceRangeKes(Number.NaN), [0, 10000]);
  });

  it("maps a price above the top edge to a capped upper band", () => {
    const [lo, hi] = priceRangeKes(6_000_000); // KES 60,000 (above the 50,000 edge)
    assert.equal(lo, 5_000_000);
    assert.ok(hi > lo);
  });
});

describe("buildEntityInput", () => {
  it("builds a publisher product entity with the ua:product:<id> external_ref", () => {
    const e = buildEntityInput({ _id: "prod_123", name: "Leather Belt", category: "Belts" });
    assert.equal(e.entity_type, "product");
    assert.deepEqual(e.role_flags, ["publisher"]);
    assert.equal(e.external_ref, "ua:product:prod_123");
    assert.equal((e.attributes as { vertical: string }).vertical, HAKKEN_VERTICAL);
  });
});

describe("buildBroadcastInput", () => {
  const product: ProductForHakken = { _id: "p1", name: "Silk Scarf", category: "Scarves", price_minor: 320000 };

  it("clamps ttl_at to ≤ now + 168h and defaults to the max", () => {
    const def = buildBroadcastInput({ publisherId: "ent_1", type: "new_arrival", consentScope: "single_app", nowMs: NOW });
    assert.equal(Date.parse(def.ttl_at) - NOW, BROADCAST_TTL_MAX_MS);

    const clamped = buildBroadcastInput({ publisherId: "ent_1", type: "restock", consentScope: "cross_app_optional", nowMs: NOW, ttlMs: 999 * 60 * 60 * 1000 });
    assert.ok(Date.parse(clamped.ttl_at) - NOW <= BROADCAST_TTL_MAX_MS);
  });

  it("carries a price_range_kes band (never a raw price) and a consent scope", () => {
    const b = buildBroadcastInput({ publisherId: "ent_1", type: "new_arrival", consentScope: "cross_app_required", nowMs: NOW, product });
    assert.ok(Array.isArray(b.price_range_kes));
    assert.equal(b.consent_scope, "cross_app_required");
    assert.equal(b.broadcast_type, "new_arrival");
    // The builder runs containment, so a money key like `price` can never be present.
    assert.equal(Object.prototype.hasOwnProperty.call(b, "price"), false);
  });

  it("omits price_range_kes when the product has no usable price", () => {
    const b = buildBroadcastInput({ publisherId: "ent_1", type: "restock", consentScope: "single_app", nowMs: NOW, product: { _id: "p2" } });
    assert.equal(b.price_range_kes, undefined);
  });
});

describe("filterToVertical — app-layer vertical isolation", () => {
  it("keeps only UA-vertical results and drops the rest", () => {
    const out = filterToVertical([
      { entity_id: "a", vertical: "unique_accessories" },
      { entity_id: "b", vertical: "lunchdrop" },
      { entity_id: "c", vertical: "unique_accessories" },
    ]);
    assert.deepEqual(out.map((r) => r.entity_id), ["a", "c"]);
  });

  it("returns [] for undefined / non-array (e.g. a paused query)", () => {
    assert.deepEqual(filterToVertical(undefined), []);
  });
});
