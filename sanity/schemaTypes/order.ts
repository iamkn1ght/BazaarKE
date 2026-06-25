// Order document — rail-aligned (Kipkiren Pay) with PayPal-era fields retained as legacy.
//
// Additive migration per RAIL_INTEGRATION_PLAYBOOK.md §4.3:
//  - New rail fields: account_uuid, state, total_minor, kp_charge_id, itafika_job_id,
//    traceparent, business_op_id, rail_audit[], legacy.
//  - KES money is INTEGER MINOR UNITS only — every *_minor field carries Rule.integer().min(0).
//  - Legacy text-shaped fields (shippingAddress, rawCapture) + the PayPal fields are KEPT so
//    existing tagged orders stay readable. New orders are written by the KP capture flow (Week 2).

type RuleLike = {
  integer: () => RuleLike;
  min: (n: number) => RuleLike;
  required: () => RuleLike;
};

export default {
  name: 'order',
  type: 'document',
  title: 'Order',
  readOnly: true,
  groups: [
    { name: 'rail', title: 'Rail (current)' },
    { name: 'legacy', title: 'Legacy (PayPal)' },
    { name: 'audit', title: 'Audit' },
  ],
  fields: [
    // --- Rail (current) ---
    {
      name: 'account_uuid',
      title: 'Identiti account UUID',
      type: 'string',
      group: 'rail',
      description: 'Identiti customer FK (acc_<uuid>). Primary FK for every order. tier-0 for anonymous express.',
    },
    {
      name: 'initiated_by',
      title: 'Initiated by',
      type: 'string',
      group: 'rail',
      initialValue: 'customer',
      options: {
        list: [
          { title: 'Customer (human checkout)', value: 'customer' },
          { title: 'Agent (Helpan auto-refill)', value: 'agent' },
        ],
      },
      description: 'Who placed the order. "agent" = a Helpan delegated-authority dispatch (Phase 2).',
    },
    {
      name: 'agent_id',
      title: 'Helpan agent ID',
      type: 'string',
      group: 'rail',
      description: 'Set only when initiated_by="agent" — the Helpan agent (e.g. helpan-unique-accessories-v1).',
    },
    {
      name: 'state',
      title: 'State',
      type: 'string',
      group: 'rail',
      options: {
        list: [
          { title: 'Pending payment', value: 'PENDING' },
          { title: 'Paid', value: 'PAID' },
          { title: 'Dispatched', value: 'DISPATCHED' },
          { title: 'Delivered', value: 'DELIVERED' },
          { title: 'Refunded', value: 'REFUNDED' },
          { title: 'Failed', value: 'FAILED' },
          { title: 'Cancelled', value: 'CANCELLED' },
        ],
      },
    },
    {
      name: 'total_minor',
      title: 'Total (KES minor units)',
      type: 'number',
      group: 'rail',
      description: 'Order total in KES integer minor units (KES 50 = 5000). Wire field on KP is amount_minor.',
      validation: (Rule: RuleLike) => Rule.integer().min(0),
    },
    {
      name: 'currency',
      title: 'Currency',
      type: 'string',
      group: 'rail',
      initialValue: 'KES',
    },
    {
      name: 'kp_charge_id',
      title: 'Kipkiren Pay charge ID',
      type: 'string',
      group: 'rail',
      description: 'charge_id from POST /v1/charges/initiate (KP). Idempotency anchor for the order.',
    },
    {
      name: 'itafika_job_id',
      title: 'Itafika job ID',
      type: 'string',
      group: 'rail',
      description: 'job_id from POST /v1/jobs (Itafika). Set on dispatch.',
    },
    {
      name: 'delivery_fee_minor',
      title: 'Delivery fee (KES minor units)',
      type: 'number',
      group: 'rail',
      description: 'Itafika quote price_minor at dispatch. KP-16 charging is observe-only at MVP (reconciliation).',
      validation: (Rule: RuleLike) => Rule.integer().min(0),
    },
    {
      name: 'shipping_destination',
      title: 'Shipping destination (geo)',
      type: 'object',
      group: 'rail',
      description: 'Customer delivery point for Itafika. Populated once checkout collects a geocoded address.',
      fields: [
        { name: 'lat', type: 'number', title: 'Latitude' },
        { name: 'lng', type: 'number', title: 'Longitude' },
        { name: 'label', type: 'string', title: 'Label' },
      ],
    },
    {
      name: 'items',
      title: 'Items',
      type: 'array',
      group: 'rail',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'name', type: 'string', title: 'Name' },
            { name: 'quantity', type: 'number', title: 'Quantity', validation: (Rule: RuleLike) => Rule.integer().min(0) },
            {
              name: 'unit_price_minor',
              type: 'number',
              title: 'Unit price (KES minor units)',
              validation: (Rule: RuleLike) => Rule.integer().min(0),
            },
          ],
        },
      ],
    },

    // --- Audit (§A.11) ---
    {
      name: 'traceparent',
      title: 'Traceparent',
      type: 'string',
      group: 'audit',
      description: 'W3C traceparent for the business operation; propagated across all rail calls.',
    },
    {
      name: 'business_op_id',
      title: 'Business operation ID',
      type: 'string',
      group: 'audit',
      description: 'Single business-operation UUID (order_id) idempotency keys derive from.',
    },
    {
      name: 'rail_audit',
      title: 'Rail audit trail',
      type: 'array',
      group: 'audit',
      description: 'One row per rail call (§A.11): rail, action, request_id, traceparent, business_op_id, timestamp.',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'rail', type: 'string', title: 'Rail' },
            { name: 'action', type: 'string', title: 'Action' },
            { name: 'request_id', type: 'string', title: 'Rail request_id (meta.request_id)' },
            { name: 'traceparent', type: 'string', title: 'Traceparent' },
            { name: 'business_op_id', type: 'string', title: 'Business op ID' },
            { name: 'initiated_by', type: 'string', title: 'Initiated by (customer | agent)' },
            { name: 'agent_id', type: 'string', title: 'Helpan agent ID (agent-initiated calls)' },
            { name: 'timestamp', type: 'datetime', title: 'Timestamp' },
            { name: 'success', type: 'boolean', title: 'Success' },
            { name: 'error_code', type: 'string', title: 'Error code' },
          ],
        },
      ],
    },

    // --- Legacy (PayPal) — retained for tagged historical orders; never written by new flows ---
    {
      name: 'legacy',
      title: 'Legacy tag',
      type: 'string',
      group: 'legacy',
      description: "Set to 'paypal' for PayPal-era test orders (CHAMIA-DATASET-CLEANUP: tag, do not drop).",
    },
    { name: 'paypalOrderId', title: 'PayPal Order ID (legacy)', type: 'string', group: 'legacy' },
    { name: 'status', title: 'Status (legacy PayPal)', type: 'string', group: 'legacy' },
    { name: 'total', title: 'Total (legacy, major units)', type: 'number', group: 'legacy' },
    { name: 'payerEmail', title: 'Payer email (legacy)', type: 'string', group: 'legacy' },
    { name: 'payerName', title: 'Payer name (legacy)', type: 'string', group: 'legacy' },
    { name: 'shippingAddress', title: 'Shipping address (legacy text)', type: 'text', group: 'legacy' },
    { name: 'capturedAt', title: 'Captured at (legacy)', type: 'datetime', group: 'legacy' },
    {
      name: 'rawCapture',
      title: 'Raw PayPal capture response (legacy)',
      type: 'text',
      group: 'legacy',
      description: 'Full JSON from the legacy PayPal capture-order call (kept for audit).',
    },
  ],
  preview: {
    select: {
      title: 'kp_charge_id',
      legacyTitle: 'paypalOrderId',
      subtitle: 'state',
      legacySubtitle: 'status',
    },
    prepare({
      title,
      legacyTitle,
      subtitle,
      legacySubtitle,
    }: {
      title?: string;
      legacyTitle?: string;
      subtitle?: string;
      legacySubtitle?: string;
    }) {
      return {
        title: title ?? legacyTitle ?? 'Unknown order',
        subtitle: subtitle ?? legacySubtitle ?? '',
      };
    },
  },
};
