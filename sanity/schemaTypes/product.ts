export default {
    name: 'product',
    type: 'document',
    title: 'Product',
    fields: [
        {
            name: 'name',
            type: 'string',
            title: 'Name of Product'
        },
        {
            name: 'images',
            type: 'array',
            title: 'Product Images',
            of: [{type: 'image'}],
        },
        {
            name: 'description',
            type: 'text',
            title: 'Description of Product'
        },
        {
            name: 'slug',
            type: 'slug',
            title: 'Product Slug',
            options: {
                source: 'name',
            }
        },
        {
            name: 'price',
            title: 'Price (legacy, unmarked units)',
            type: 'number',
            description: 'Legacy PayPal-era price. Superseded by price_minor (KES integer minor units). Retained for reference during migration.',
        },
        {
            name: 'price_minor',
            title: 'Price (KES minor units)',
            type: 'number',
            description: 'Catalog price in KES integer minor units (KES 50 = 5000). Set by the KES re-price migration (CHAMIA-CURRENCY: no FX).',
            validation: (Rule: { integer: () => { min: (n: number) => unknown } }) => Rule.integer().min(0),
        },
        {
            name: 'category',
            title: 'Product Category',
            type: 'reference',
            to: [{
                type: 'category',
            }],
        },
    ],
}