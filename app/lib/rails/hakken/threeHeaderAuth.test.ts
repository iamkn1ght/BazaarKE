import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildThreeHeaderAuth } from "./threeHeaderAuth";

describe("buildThreeHeaderAuth", () => {
  const base = { jwt: "jwt.aud.hakken", appKey: "unique_accessories", appSecret: "sek", idempotencyKey: "idem-1" };

  it("emits the Bearer JWT + the two X-Hakken headers + an idempotency key", () => {
    const h = buildThreeHeaderAuth(base);
    assert.equal(h.Authorization, "Bearer jwt.aud.hakken");
    assert.equal(h["X-Hakken-App-Key"], "unique_accessories");
    assert.equal(h["X-Hakken-App-Secret"], "sek");
    assert.equal(h["X-Idempotency-Key"], "idem-1");
  });

  it("includes traceparent only when provided", () => {
    assert.equal(buildThreeHeaderAuth(base).traceparent, undefined);
    assert.equal(buildThreeHeaderAuth({ ...base, traceparent: "00-abc-def-01" }).traceparent, "00-abc-def-01");
  });
});
