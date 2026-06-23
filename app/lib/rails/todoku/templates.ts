import type { TodokuChannel } from "./types";

/**
 * Todoku template registry — the 8 unique_accessories templates.
 *
 * The ULIDs are issued by Silvia (see OPERATOR_REQUEST_TODOKU.md) and delivered out-of-band.
 * Until then each id reads from an env var (TODOKU_TPL_*) and falls back to a PENDING sentinel;
 * templateId() throws TEMPLATE_NOT_READY rather than sending against a placeholder ULID. The
 * mandatory anti-impersonation copy lives in the template body (submitted at operator-request
 * time), not here.
 */

export type TodokuTemplateKey =
  | "order_confirmed_sms"
  | "order_confirmed_whatsapp"
  | "shipping_dispatched_sms"
  | "delivery_imminent_sms"
  | "delivery_completed_sms"
  | "refund_initiated_sms"
  | "cart_abandonment_whatsapp"
  | "restock_notification_whatsapp";

export interface TodokuTemplate {
  id: string;
  channel: TodokuChannel;
  slug: string;
}

const PENDING = "PENDING_OPERATOR_ULID";

function tpl(envVar: string, channel: TodokuChannel, slug: string): TodokuTemplate {
  return { id: process.env[envVar] ?? PENDING, channel, slug };
}

export const TODOKU_TEMPLATES: Record<TodokuTemplateKey, TodokuTemplate> = {
  order_confirmed_sms: tpl("TODOKU_TPL_ORDER_CONFIRMED_SMS", "sms", "unique_accessories_order_confirmed_sms"),
  order_confirmed_whatsapp: tpl("TODOKU_TPL_ORDER_CONFIRMED_WHATSAPP", "whatsapp", "unique_accessories_order_confirmed_whatsapp"),
  shipping_dispatched_sms: tpl("TODOKU_TPL_SHIPPING_DISPATCHED_SMS", "sms", "unique_accessories_shipping_dispatched_sms"),
  delivery_imminent_sms: tpl("TODOKU_TPL_DELIVERY_IMMINENT_SMS", "sms", "unique_accessories_delivery_imminent_sms"),
  delivery_completed_sms: tpl("TODOKU_TPL_DELIVERY_COMPLETED_SMS", "sms", "unique_accessories_delivery_completed_sms"),
  refund_initiated_sms: tpl("TODOKU_TPL_REFUND_INITIATED_SMS", "sms", "unique_accessories_refund_initiated_sms"),
  cart_abandonment_whatsapp: tpl("TODOKU_TPL_CART_ABANDONMENT_WHATSAPP", "whatsapp", "unique_accessories_cart_abandonment_whatsapp"),
  restock_notification_whatsapp: tpl("TODOKU_TPL_RESTOCK_NOTIFICATION_WHATSAPP", "whatsapp", "unique_accessories_restock_notification_whatsapp"),
};

/** Resolve a template's ULID, or throw TEMPLATE_NOT_READY if the operator hasn't delivered it yet. */
export function templateId(key: TodokuTemplateKey): string {
  const t = TODOKU_TEMPLATES[key];
  if (!t || t.id === PENDING) {
    throw new Error(`TEMPLATE_NOT_READY: ${key} (awaiting ULID from Silvia per OPERATOR_REQUEST_TODOKU.md)`);
  }
  return t.id;
}

export function templateChannel(key: TodokuTemplateKey): TodokuChannel {
  return TODOKU_TEMPLATES[key].channel;
}
