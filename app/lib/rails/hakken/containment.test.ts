import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertContainmentSafe,
  RegulatoryContainmentError,
  looksLikeEmail,
  looksLikeMsisdn,
  looksLikePersonName,
  type ContainmentOptions,
} from "./containment";

/** Returns the violation code, or null if the payload is clean. */
function check(payload: unknown, opts: ContainmentOptions = {}): string | null {
  try {
    assertContainmentSafe(payload, opts);
    return null;
  } catch (e) {
    if (e instanceof RegulatoryContainmentError) return e.code;
    throw e;
  }
}

describe("assertContainmentSafe — §10.7 banned-key wall", () => {
  it("passes a product-shaped payload with a price_range_kes band", () => {
    assert.equal(
      check({ title: "Italian Leather Wallet", category: "Wallets", vertical: "unique_accessories", price_range_kes: [50000, 100000] }),
      null,
    );
  });

  it("rejects money-shaped keys at the top level", () => {
    for (const key of ["amount", "currency", "money", "balance", "refund", "monetary_value", "kes_amount"]) {
      assert.equal(check({ [key]: 1 }), "REGULATORY_CONTAINMENT_VIOLATION", `expected ${key} banned`);
    }
  });

  it("rejects a banned key at ANY nesting depth (object + array)", () => {
    assert.equal(check({ a: { b: [{ c: { currency: "KES" } }] } }), "REGULATORY_CONTAINMENT_VIOLATION");
    assert.equal(check({ items: [{ ok: 1 }, { amount: 2 }] }), "REGULATORY_CONTAINMENT_VIOLATION");
  });

  it("matches banned keys case-insensitively", () => {
    assert.equal(check({ Amount: 1 }), "REGULATORY_CONTAINMENT_VIOLATION");
    assert.equal(check({ CURRENCY: "x" }), "REGULATORY_CONTAINMENT_VIOLATION");
  });

  it("bans bare 'price' and the app's *_minor money keys (raw prices must never be sent)", () => {
    for (const key of ["price", "price_minor", "amount_minor", "total_minor", "unit_price_minor"]) {
      assert.equal(check({ [key]: 5000 }), "REGULATORY_CONTAINMENT_VIOLATION", `expected ${key} banned`);
    }
  });

  it("carves out ONLY the opaque source_payment / source_payment_ref keys, never money-suffixed variants", () => {
    // default: every source_payment* key is banned
    assert.equal(check({ source_payment_ref: "x" }), "REGULATORY_CONTAINMENT_VIOLATION");
    assert.equal(check({ source_payment: "x" }), "REGULATORY_CONTAINMENT_VIOLATION");
    // carve-out: only the reference keys pass
    assert.equal(check({ source_payment_ref: "x" }, { allowSourcePayment: true }), null);
    assert.equal(check({ source_payment: "x" }, { allowSourcePayment: true }), null);
    // carve-out must NOT let money-suffixed variants through
    for (const key of ["source_payment_amount", "source_payment_currency", "source_payment_balance", "source_payment_monetary_value"]) {
      assert.equal(check({ [key]: 5000 }, { allowSourcePayment: true }), "REGULATORY_CONTAINMENT_VIOLATION", `expected ${key} banned even with carve-out`);
    }
  });

  it("does NOT ban approved/near-miss keys (price_range_kes, tier_slug, currency_code)", () => {
    assert.equal(check({ price_range_kes: [50000, 100000] }), null);
    assert.equal(check({ tier_slug: "boosted" }), null);
    assert.equal(check({ currency_code: "KES" }), null); // exact-key match only, not substring
  });
});

describe("assertContainmentSafe — PII wall", () => {
  it("rejects MSISDN values anywhere — 07x, 01x, country-coded, and separated forms", () => {
    assert.equal(check({ note: "ring +254712345678 on arrival" }), "PII_CONTAINMENT_VIOLATION");
    assert.equal(check({ deep: { x: "0712345678" } }), "PII_CONTAINMENT_VIOLATION");
    assert.equal(check({ note: "0110000000" }), "PII_CONTAINMENT_VIOLATION"); // Safaricom 01x
    assert.equal(check({ note: "0100123456" }), "PII_CONTAINMENT_VIOLATION"); // Airtel 01x
    assert.equal(check({ note: "254110000456" }), "PII_CONTAINMENT_VIOLATION"); // country code, no '+'
    assert.equal(check({ note: "0712 345 678" }), "PII_CONTAINMENT_VIOLATION"); // spaced
    assert.equal(check({ note: "0712-345-678" }), "PII_CONTAINMENT_VIOLATION"); // dashed
  });

  it("rejects email values anywhere", () => {
    assert.equal(check({ contact: "buyer@example.com" }), "PII_CONTAINMENT_VIOLATION");
  });

  it("STILL catches email/MSISDN under a product-content key (only the person-NAME scan is exempted)", () => {
    assert.equal(check({ title: "buyer@example.com" }), "PII_CONTAINMENT_VIOLATION");
    assert.equal(check({ brand: "reach us on 0712345678" }), "PII_CONTAINMENT_VIOLATION");
    assert.equal(check({ tags: ["someone@example.com"] }), "PII_CONTAINMENT_VIOLATION"); // array-valued product key
  });

  it("rejects two-word capitalised personal names in NON-product fields", () => {
    assert.equal(check({ seller: "Jane Doe" }), "PII_CONTAINMENT_VIOLATION");
    assert.equal(check({ meta: { owner: "John Smith" } }), "PII_CONTAINMENT_VIOLATION");
  });

  it("exempts product-content fields from the person-name scan (titles/brands aren't names)", () => {
    assert.equal(check({ title: "Italian Leather Wallet" }), null);
    assert.equal(check({ category: "Men Bags" }), null);
    assert.equal(check({ brand: "New Balance" }), null);
  });

  it("allows single capitalised words and non-PII strings", () => {
    assert.equal(check({ vendor: "Adidas", note: "Restocked today" }), null);
  });
});

describe("PII detectors", () => {
  it("looksLikeMsisdn", () => {
    assert.equal(looksLikeMsisdn("+254712345678"), true);
    assert.equal(looksLikeMsisdn("0712345678"), true);
    assert.equal(looksLikeMsisdn("just text"), false);
  });
  it("looksLikeEmail", () => {
    assert.equal(looksLikeEmail("a@b.co"), true);
    assert.equal(looksLikeEmail("no-at-sign"), false);
  });
  it("looksLikePersonName", () => {
    assert.equal(looksLikePersonName("Jane Doe"), true);
    assert.equal(looksLikePersonName("Wallet"), false);
    assert.equal(looksLikePersonName("SALE NOW"), false); // ALL-CAPS not a name
  });
});
