import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildCanonical,
  sha256Hex,
  signCanonical,
  signRequest,
  verifyBase64Signature,
  CONTENT_TYPE_JSON,
} from "./signRequest";

// A sample hex-64 secret (shape only — not a real credential).
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TS = "2026-06-23T12:00:00.000Z";

/** Independent reference HMAC so the test validates the wrapper's logic, not itself. */
function refSig(canonical: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(canonical, "utf8").digest("base64");
}

describe("sha256Hex", () => {
  it("hashes the empty string to the known SHA-256 constant", () => {
    assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("is lowercase hex and input-sensitive", () => {
    assert.match(sha256Hex("a"), /^[0-9a-f]{64}$/);
    assert.notEqual(sha256Hex("a"), sha256Hex("b"));
  });
});

describe("buildCanonical", () => {
  it("joins 5 newline fields, uppercases method, hex-hashes body, keeps the /v1/ path", () => {
    const lines = buildCanonical("post", "/v1/customers", CONTENT_TYPE_JSON, TS, "{}").split("\n");
    assert.equal(lines.length, 5);
    assert.equal(lines[0], "POST");
    assert.equal(lines[1], "/v1/customers"); // signed WITH the /v1/ prefix
    assert.equal(lines[2], CONTENT_TYPE_JSON);
    assert.equal(lines[3], TS);
    assert.equal(lines[4], sha256Hex("{}")); // body hash is hex
  });
  it("uses empty content-type and empty-body hash for a bodyless GET", () => {
    const lines = buildCanonical("GET", "/v1/customers/acc_1/tier", "", TS, "").split("\n");
    assert.equal(lines[2], "");
    assert.equal(lines[4], sha256Hex(""));
  });
});

describe("signCanonical", () => {
  it("outputs a BASE64 (not hex) HMAC matching an independent reference", () => {
    const canonical = buildCanonical("POST", "/v1/customers", CONTENT_TYPE_JSON, TS, "{}");
    const sig = signCanonical(canonical, SECRET);
    assert.equal(sig, refSig(canonical));
    assert.match(sig, /^[A-Za-z0-9+/]+={0,2}$/); // base64 charset
    assert.doesNotMatch(sig, /^[0-9a-f]{64}$/); // explicitly NOT hex
  });
});

describe("signRequest — POST with body", () => {
  const r = signRequest({
    prefix: "Identiti",
    appId: "unique_accessories_sandbox",
    secret: SECRET,
    method: "POST",
    pathAndQuery: "/v1/customers",
    body: "{}",
    timestamp: TS,
  });
  it("formats Authorization as <Prefix>-HMAC-SHA256 app_id=..., signature=<base64>", () => {
    const canonical = buildCanonical("POST", "/v1/customers", CONTENT_TYPE_JSON, TS, "{}");
    assert.equal(
      r.headers.Authorization,
      `Identiti-HMAC-SHA256 app_id=unique_accessories_sandbox, signature=${refSig(canonical)}`,
    );
  });
  it("sets the rail-specific timestamp header to the provided timestamp", () => {
    assert.equal(r.headers["X-Identiti-Timestamp"], TS);
  });
  it("sends Content-Type application/json; charset=utf-8 on a bodied request", () => {
    assert.equal(r.headers["Content-Type"], CONTENT_TYPE_JSON);
  });
  it("attaches a UUIDv4 idempotency key on writes", () => {
    assert.match(
      r.headers["X-Idempotency-Key"],
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("signRequest — bodyless GET", () => {
  const r = signRequest({
    prefix: "Identiti",
    appId: "ua",
    secret: SECRET,
    method: "GET",
    pathAndQuery: "/v1/customers/acc_1/tier",
    timestamp: TS,
  });
  it("omits the Content-Type header entirely", () => {
    assert.equal(r.headers["Content-Type"], undefined);
  });
  it("omits the idempotency key on GET", () => {
    assert.equal(r.headers["X-Idempotency-Key"], undefined);
  });
  it("signs over an empty content-type and empty body", () => {
    const canonical = buildCanonical("GET", "/v1/customers/acc_1/tier", "", TS, "");
    assert.equal(r.signature, refSig(canonical));
  });
});

describe("signRequest — sensitivity", () => {
  it("changes the signature when the body changes", () => {
    const base = {
      prefix: "KipkirenPay" as const,
      appId: "ua",
      secret: SECRET,
      method: "POST",
      pathAndQuery: "/v1/charges/initiate",
      timestamp: TS,
    };
    const a = signRequest({ ...base, body: '{"amount_minor":5000}' });
    const b = signRequest({ ...base, body: '{"amount_minor":6000}' });
    assert.notEqual(a.signature, b.signature);
  });
});

describe("verifyBase64Signature", () => {
  it("accepts a correct signature and rejects tampered / wrong-length ones", () => {
    const canonical = buildCanonical("POST", "/v1/charges/initiate", CONTENT_TYPE_JSON, TS, "{}");
    const good = signCanonical(canonical, SECRET);
    assert.equal(verifyBase64Signature(canonical, SECRET, good), true);
    assert.equal(verifyBase64Signature(canonical, SECRET, good.slice(0, -2) + "AA"), false);
    assert.equal(verifyBase64Signature(canonical, SECRET, "short"), false); // length-mismatch branch
  });
});
