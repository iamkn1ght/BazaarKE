import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { processHelpanWebhookEvent, type HelpanWebhookDeps } from "./handlers-core";
import type { HelpanWebhookEvent } from "./types";

function mkDeps(opts: { alreadySeen?: boolean; revokeThrows?: boolean } = {}) {
  const rec = { seen: [] as string[], released: [] as string[], revoked: [] as string[] };
  const deps: HelpanWebhookDeps = {
    seenBefore: async (k) => {
      rec.seen.push(k);
      return Boolean(opts.alreadySeen);
    },
    releaseDedup: async (k) => {
      rec.released.push(k);
    },
    revokeAuthority: async (jti) => {
      rec.revoked.push(jti);
      if (opts.revokeThrows) throw new Error("kv down");
    },
  };
  return { deps, rec };
}

const ev = (over: Partial<HelpanWebhookEvent> = {}): HelpanWebhookEvent => ({ event: "AUTHORITY_REVOKED", jti: "jti1", ...over });

describe("processHelpanWebhookEvent — inbound webhook orchestration", () => {
  it("revokes a fresh AUTHORITY_REVOKED by its jti and claims dedup", async () => {
    const { deps, rec } = mkDeps();
    await processHelpanWebhookEvent(ev(), deps);
    assert.deepEqual(rec.revoked, ["jti1"]);
    assert.equal(rec.seen.length, 1);
    assert.equal(rec.seen[0], "dedup:helpan:AUTHORITY_REVOKED:jti1");
    assert.equal(rec.released.length, 0); // success → claim retained
  });

  it("acks an unknown event without dedup or revoke", async () => {
    const { deps, rec } = mkDeps();
    await processHelpanWebhookEvent(ev({ event: "SOMETHING_ELSE" }), deps);
    assert.equal(rec.seen.length, 0);
    assert.equal(rec.revoked.length, 0);
  });

  it("acks AUTHORITY_REVOKED with no jti (nothing to revoke)", async () => {
    const { deps, rec } = mkDeps();
    await processHelpanWebhookEvent(ev({ jti: undefined }), deps);
    assert.equal(rec.seen.length, 0);
    assert.equal(rec.revoked.length, 0);
  });

  it("a redelivery (already deduped) is a no-op", async () => {
    const { deps, rec } = mkDeps({ alreadySeen: true });
    await processHelpanWebhookEvent(ev(), deps);
    assert.equal(rec.seen.length, 1);
    assert.equal(rec.revoked.length, 0);
  });

  it("a revoke failure releases the dedup claim and rethrows (so a redelivery can recover)", async () => {
    const { deps, rec } = mkDeps({ revokeThrows: true });
    await assert.rejects(() => processHelpanWebhookEvent(ev(), deps), /kv down/);
    assert.equal(rec.revoked.length, 1);
    assert.equal(rec.released.length, 1);
  });
});
