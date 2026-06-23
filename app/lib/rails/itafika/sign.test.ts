import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildCanonical, CONTENT_TYPE_JSON } from "../_shared/signRequest";
import { itafikaInboundSignature, signItafikaRequest, verifyItafikaInbound } from "./sign";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // hex-64 shape
const TS = "2026-06-24T09:00:00.000Z";

describe("signItafikaRequest — outbound (base64)", () => {
  const r = signItafikaRequest({
    appId: "unique_accessories",
    secret: SECRET,
    method: "POST",
    pathAndQuery: "/v1/jobs",
    body: '{"anchor_reference_id":"ua_order_1"}',
    timestamp: TS,
  });

  it("emits a base64 signature over the shared 5-line canonical", () => {
    const canonical = buildCanonical("POST", "/v1/jobs", CONTENT_TYPE_JSON, TS, '{"anchor_reference_id":"ua_order_1"}');
    const expected = createHmac("sha256", SECRET).update(canonical, "utf8").digest("base64");
    assert.equal(r.signature, expected);
    assert.match(r.signature, /^[A-Za-z0-9+/]+={0,2}$/);
  });
  it("uses the Itafika Authorization prefix and lowercase headers", () => {
    assert.equal(r.headers.Authorization, `Itafika-HMAC-SHA256 app_id=unique_accessories, signature=${r.signature}`);
    assert.equal(r.headers["x-itafika-timestamp"], TS);
    assert.equal(r.headers["content-type"], CONTENT_TYPE_JSON);
    assert.match(r.headers["x-idempotency-key"], /^[0-9a-f-]{36}$/i);
  });
});

describe("signItafikaRequest — bodyless GET (the 401 trap)", () => {
  const r = signItafikaRequest({
    appId: "unique_accessories",
    secret: SECRET,
    method: "GET",
    pathAndQuery: "/v1/jobs/job_123",
    timestamp: TS,
  });
  it("signs an EMPTY content-type and sends NO Content-Type header", () => {
    const canonical = buildCanonical("GET", "/v1/jobs/job_123", "", TS, "");
    const expected = createHmac("sha256", SECRET).update(canonical, "utf8").digest("base64");
    assert.equal(r.signature, expected);
    assert.equal(r.headers["content-type"], undefined);
    assert.equal(r.headers["x-idempotency-key"], undefined);
  });
});

describe("inbound verification — hex over <timestamp>.<rawBody>", () => {
  const rawBody = '{"event":"job.delivered","job_id":"job_123","state":"DELIVERED"}';
  it("produces hex (not base64) and differs from the outbound canonical scheme", () => {
    const sig = itafikaInboundSignature(TS, rawBody, SECRET);
    assert.match(sig, /^[0-9a-f]{64}$/); // hex sha256
    // It is the HMAC of the dot-delimited string, NOT the 5-line canonical.
    const expected = createHmac("sha256", SECRET).update(`${TS}.${rawBody}`, "utf8").digest("hex");
    assert.equal(sig, expected);
  });
  it("verifies a correct signature and rejects tampered ones (constant-time)", () => {
    const good = itafikaInboundSignature(TS, rawBody, SECRET);
    assert.equal(verifyItafikaInbound(TS, rawBody, SECRET, good), true);
    assert.equal(verifyItafikaInbound(TS, rawBody, SECRET, good.slice(0, -2) + "00"), false);
    assert.equal(verifyItafikaInbound(TS, rawBody + " ", SECRET, good), false); // body tamper
    assert.equal(verifyItafikaInbound(TS, rawBody, SECRET, "short"), false); // length-mismatch branch
  });
});
