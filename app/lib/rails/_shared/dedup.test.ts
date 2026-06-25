import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupKey, releaseDedup, seenBefore } from "./dedup";

// No KV env in tests → these exercise the in-memory fallback, which mirrors the KV set-if-absent
// (nx) semantic contract: first sighting proceeds, repeats are duplicates, release re-opens the key.

describe("dedupKey", () => {
  it("builds the dedup:<rail>:<event>:<key> shape", () => {
    assert.equal(dedupKey("kp", "PAYMENT_COMPLETED", "ua_order_1"), "dedup:kp:PAYMENT_COMPLETED:ua_order_1");
    assert.equal(dedupKey("itafika", "job.delivered", "job_9"), "dedup:itafika:job.delivered:job_9");
  });
});

describe("seenBefore / releaseDedup (in-memory fallback)", () => {
  it("claims a new key once, then reports later sightings as duplicates", async () => {
    const k = dedupKey("kp", "claim", "k1");
    assert.equal(await seenBefore(k), false); // first → proceed
    assert.equal(await seenBefore(k), true); // duplicate → skip
    assert.equal(await seenBefore(k), true);
  });

  it("keeps distinct keys independent", async () => {
    const a = dedupKey("kp", "indep", "A");
    const b = dedupKey("kp", "indep", "B");
    assert.equal(await seenBefore(a), false);
    assert.equal(await seenBefore(b), false); // claiming a must not claim b
    assert.equal(await seenBefore(a), true);
    assert.equal(await seenBefore(b), true);
  });

  it("re-opens a claimed key after release (claim-then-crash recovery)", async () => {
    const k = dedupKey("itafika", "release", "job1");
    assert.equal(await seenBefore(k), false);
    assert.equal(await seenBefore(k), true);
    await releaseDedup(k); // processing failed after the claim → release so a redelivery re-runs
    assert.equal(await seenBefore(k), false); // re-processable
    assert.equal(await seenBefore(k), true);
  });

  it("releasing an unknown key is a no-op (does not throw)", async () => {
    await releaseDedup(dedupKey("kp", "noop", "never-claimed"));
  });

  it("expires a key after its TTL so a delayed redelivery is re-seen", async () => {
    const k = dedupKey("kp", "ttl", "x");
    assert.equal(await seenBefore(k, 0.03), false); // 30 ms TTL
    assert.equal(await seenBefore(k, 0.03), true);
    await new Promise((r) => setTimeout(r, 90)); // > TTL
    assert.equal(await seenBefore(k, 0.03), false); // expired → treated as new
  });
});
