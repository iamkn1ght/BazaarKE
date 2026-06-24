import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coerceDestination,
  coercePoint,
  haversineMeters,
  isServiceablePoint,
  parseLatLngInput,
} from "./geo";

const NAIROBI = { lat: -1.2921, lng: 36.8219 }; // CBD — inside the serviceable area

describe("haversineMeters", () => {
  it("is zero for identical points", () => {
    assert.equal(haversineMeters(NAIROBI, NAIROBI), 0);
  });
  it("approximates 1° of latitude as ~111 km", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    assert.ok(Math.abs(d - 111_195) < 200, `expected ~111195 m, got ${d}`);
  });
  it("returns whole metres", () => {
    const d = haversineMeters(NAIROBI, { lat: -1.3, lng: 36.83 });
    assert.ok(Number.isInteger(d));
  });
});

describe("isServiceablePoint", () => {
  it("accepts a Kenyan pin", () => {
    assert.equal(isServiceablePoint(NAIROBI.lat, NAIROBI.lng), true);
  });
  it("rejects the null island (0,0)", () => {
    assert.equal(isServiceablePoint(0, 0), false);
  });
  it("rejects a point outside Kenya (London)", () => {
    assert.equal(isServiceablePoint(51.5074, -0.1278), false);
  });
  it("rejects transposed lat/lng", () => {
    assert.equal(isServiceablePoint(36.8219, -1.2921), false); // lat 36.8 is past the box
  });
  it("accepts integer-only coordinates inside the box", () => {
    assert.equal(isServiceablePoint(0, 38), true); // northern Kenya
  });
  it("rejects out-of-range and non-finite coordinates", () => {
    assert.equal(isServiceablePoint(91, 36), false);
    assert.equal(isServiceablePoint(NaN, 36), false);
    assert.equal(isServiceablePoint(-1.29, Infinity), false);
  });
});

describe("coercePoint", () => {
  it("accepts a valid object and rounds to 6 dp", () => {
    assert.deepEqual(coercePoint({ lat: -1.29215999, lng: 36.82194001 }), { lat: -1.29216, lng: 36.82194 });
  });
  it("accepts string-encoded numbers (form input)", () => {
    assert.deepEqual(coercePoint({ lat: "-1.2921", lng: "36.8219" }), { lat: -1.2921, lng: 36.8219 });
  });
  it("rejects missing, malformed, or out-of-area input", () => {
    assert.equal(coercePoint(null), null);
    assert.equal(coercePoint("nope"), null);
    assert.equal(coercePoint({ lat: -1.2921 }), null); // no lng
    assert.equal(coercePoint({ lat: 0, lng: 0 }), null); // null island
    assert.equal(coercePoint({ lat: 51.5, lng: -0.12 }), null); // outside Kenya
  });
});

describe("coerceDestination", () => {
  it("accepts a valid point with a rider-readable label (trimmed)", () => {
    assert.deepEqual(coerceDestination({ lat: NAIROBI.lat, lng: NAIROBI.lng, label: "  Westlands, ABC Place  " }), {
      lat: NAIROBI.lat,
      lng: NAIROBI.lng,
      label: "Westlands, ABC Place",
    });
  });
  it("rejects a missing or too-short label", () => {
    assert.equal(coerceDestination({ ...NAIROBI }), null);
    assert.equal(coerceDestination({ ...NAIROBI, label: "  a  " }), null); // trims to 1 char
  });
  it("rejects an over-long label", () => {
    assert.equal(coerceDestination({ ...NAIROBI, label: "x".repeat(201) }), null);
  });
  it("rejects a valid label with an unserviceable point", () => {
    assert.equal(coerceDestination({ lat: 51.5, lng: -0.12, label: "London flat" }), null);
  });
});

describe("parseLatLngInput", () => {
  it("parses a bare 'lat, lng' pair", () => {
    assert.deepEqual(parseLatLngInput("-1.2921, 36.8219"), { lat: -1.2921, lng: 36.8219 });
  });
  it("parses a Google Maps '?q=lat,lng' URL", () => {
    assert.deepEqual(parseLatLngInput("https://maps.google.com/?q=-1.2921,36.8219"), { lat: -1.2921, lng: 36.8219 });
  });
  it("parses a Google Maps '@lat,lng,zoom' URL", () => {
    assert.deepEqual(parseLatLngInput("https://www.google.com/maps/@-1.2921,36.8219,15z"), { lat: -1.2921, lng: 36.8219 });
  });
  it("parses integer-only coordinates", () => {
    assert.deepEqual(parseLatLngInput("0,38"), { lat: 0, lng: 38 });
  });
  it("tolerates whitespace after the comma in a '?q=' URL", () => {
    assert.deepEqual(parseLatLngInput("https://maps.google.com/?q=-1.2921, 36.8219"), { lat: -1.2921, lng: 36.8219 });
  });
  it("skips an earlier non-coordinate '@' and matches the real pin", () => {
    assert.deepEqual(parseLatLngInput("a@b.com https://www.google.com/maps/@-1.2921,36.8219,15z"), {
      lat: -1.2921,
      lng: 36.8219,
    });
  });
  it("returns null for a place-name query and other non-coordinate text", () => {
    assert.equal(parseLatLngInput("https://maps.google.com/?q=Nairobi"), null);
    assert.equal(parseLatLngInput("Westlands, Nairobi"), null);
    assert.equal(parseLatLngInput(""), null);
  });
});
