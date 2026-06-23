export default {
    name: 'order',
    type: 'document',
    title: 'Order',
    readOnly: true,
    fields: [
        {
            name: 'paypalOrderId',
            title: 'PayPal Order ID',
            type: 'string',
        },
        {
            name: 'status',
            title: 'Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Pending', value: 'PENDING' },
                    { title: 'Completed', value: 'COMPLETED' },
                    { title: 'Refunded', value: 'REFUNDED' },
                    { title: 'Disputed', value: 'DISPUTED' },
                    { title: 'Failed', value: 'FAILED' },
                ],
            },
        },
        {
            name: 'currency',
            title: 'Currency',
            type: 'string',
        },
        {
            name: 'total',
            title: 'Total',
            type: 'number',
        },
        {
            name: 'items',
            title: 'Items',
            type: 'array',
            of: [
                {
                    type: 'object',
                    fields: [
                        { name: 'name', type: 'string', title: 'Name' },
                        { name: 'quantity', type: 'number', title: 'Quantity' },
                        { name: 'unitPrice', type: 'number', title: 'Unit price' },
                    ],
                },
            ],
        },
        {
            name: 'payerEmail',
            title: 'Payer email',
            type: 'string',
        },
        {
            name: 'payerName',
            title: 'Payer name',
            type: 'string',
        },
        {
            name: 'shippingAddress',
            title: 'Shipping address',
            type: 'text',
        },
        {
            name: 'capturedAt',
            title: 'Captured at',
            type: 'datetime',
        },
        {
            name: 'rawCapture',
            title: 'Raw PayPal capture response',
            type: 'text',
            description: 'Full JSON from PayPal capture-order call (kept for audit).',
        },
    ],
    preview: {
        select: {
            title: 'paypalOrderId',
            subtitle: 'status',
        },
        prepare({ title, subtitle }: { title?: string; subtitle?: string }) {
            return {
                title: title ?? 'Unknown order',
                subtitle: subtitle ?? '',
            };
        },
    },
};
