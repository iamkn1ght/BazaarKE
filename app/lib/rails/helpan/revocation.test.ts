import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAuthorityRevoked, revocationKey, revokeAuthority } from "./revocation";

// No KV env in tests → in-memory fallback (same contract as the KV store).
describe("helpan revocation store", () => {
  it("builds the helpan:revoked:<jti> key", () => {
    assert.equal(revocationKey("jti1"), "helpan:revoked:jti1");
  });

  it("an unknown jti is not revoked", async () => {
    assert.equal(await isAuthorityRevoked("never-seen"), false);
  });

  it("revoke marks a jti revoked, independently of others", async () => {
    await revokeAuthority("jtiA");
    assert.equal(await isAuthorityRevoked("jtiA"), true);
    assert.equal(await isAuthorityRevoked("jtiB"), false);
  });

  it("empty jti is a no-op (revoke and check both safe)", async () => {
    await revokeAuthority("");
    assert.equal(await isAuthorityRevoked(""), false);
  });

  it("a revocation lapses after its TTL", async () => {
    await revokeAuthority("jtiTTL", 0.2); // 200 ms — wide enough that the first check is never racing
    assert.equal(await isAuthorityRevoked("jtiTTL"), true);
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(await isAuthorityRevoked("jtiTTL"), false);
  });
});
