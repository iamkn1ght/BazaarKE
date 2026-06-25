import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newTraceparent } from "./trace";

describe("newTraceparent (§A.11)", () => {
  it("matches the W3C traceparent shape: 00-<16B trace>-<8B span>-01", () => {
    assert.match(newTraceparent(), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("mints a unique trace-id and span-id per call", () => {
    const a = newTraceparent();
    const b = newTraceparent();
    assert.notEqual(a, b);
    const parts = (t: string) => t.split("-");
    assert.notEqual(parts(a)[1], parts(b)[1]); // trace-id differs
    assert.notEqual(parts(a)[2], parts(b)[2]); // span-id differs
  });
});
