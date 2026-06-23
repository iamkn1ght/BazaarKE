import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TODOKU_TEMPLATES, templateChannel, templateId } from "./templates";
import { notifyIdempotencyKey } from "./keys";

describe("Todoku template registry", () => {
  it("defines all 8 unique_accessories templates with correct channels", () => {
    const keys = Object.keys(TODOKU_TEMPLATES);
    assert.equal(keys.length, 8);
    assert.equal(templateChannel("order_confirmed_sms"), "sms");
    assert.equal(templateChannel("order_confirmed_whatsapp"), "whatsapp");
    assert.equal(templateChannel("cart_abandonment_whatsapp"), "whatsapp");
    // Every slug is namespaced to the app.
    for (const t of Object.values(TODOKU_TEMPLATES)) {
      assert.match(t.slug, /^unique_accessories_/);
    }
  });

  it("templateId throws TEMPLATE_NOT_READY while the ULID is the pending sentinel", () => {
    // No TODOKU_TPL_* env set in tests -> all ids are the PENDING sentinel.
    assert.throws(() => templateId("order_confirmed_sms"), /TEMPLATE_NOT_READY/);
  });
});

describe("notifyIdempotencyKey", () => {
  it("builds the deterministic ua_<order_id>_<event_type> key", () => {
    assert.equal(notifyIdempotencyKey("abc123", "order_confirmed_sms"), "ua_abc123_order_confirmed_sms");
  });
});
