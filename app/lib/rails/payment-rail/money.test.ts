import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  STEPUP_THRESHOLD_MINOR,
  formatKes,
  kesMajorToMinor,
  kesMinorToMajor,
  parseAmountMinor,
  requiresStepUp,
} from "./money";

describe("kesMajorToMinor", () => {
  it("converts major units to integer minor units", () => {
    assert.equal(kesMajorToMinor(50), 5000);
    assert.equal(kesMajorToMinor(12.34), 1234);
    assert.equal(kesMajorToMinor(0.1), 10); // float-safe rounding
  });
  it("throws on non-finite input", () => {
    assert.throws(() => kesMajorToMinor(Number.POSITIVE_INFINITY));
    assert.throws(() => kesMajorToMinor(Number.NaN));
  });
});

describe("kesMinorToMajor", () => {
  it("converts integer minor units to major", () => {
    assert.equal(kesMinorToMajor(5000), 50);
  });
  it("rejects non-integer minor units", () => {
    assert.throws(() => kesMinorToMajor(50.5));
  });
});

describe("formatKes", () => {
  it("formats integer minor units as KES with 2 dp", () => {
    assert.equal(formatKes(5000), "KES 50.00");
    assert.equal(formatKes(0), "KES 0.00");
    assert.equal(formatKes(1234), "KES 12.34");
  });
  it("rejects non-integer minor units (no float money)", () => {
    assert.throws(() => formatKes(50.5));
  });
});

describe("parseAmountMinor", () => {
  it("parses KP's string-encoded amount_minor to an integer", () => {
    assert.equal(parseAmountMinor("5000"), 5000);
    assert.equal(parseAmountMinor(5000), 5000);
  });
  it("rejects fractional amounts", () => {
    assert.throws(() => parseAmountMinor("50.5"));
  });
});

describe("requiresStepUp", () => {
  it("is true at/above KES 10,000 and false below", () => {
    assert.equal(STEPUP_THRESHOLD_MINOR, 1_000_000);
    assert.equal(requiresStepUp(STEPUP_THRESHOLD_MINOR), true);
    assert.equal(requiresStepUp(STEPUP_THRESHOLD_MINOR - 1), false);
  });
});
