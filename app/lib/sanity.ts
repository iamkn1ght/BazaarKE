import imageUrlBuilder from '@sanity/image-url';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';
import { createClient } from 'next-sanity';

export const sanityProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'd0fzn4cs';
export const sanityDataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'sanityyy';
export const sanityApiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION ?? '2022-03-25';

export const client = createClient({
    projectId: sanityProjectId,
    dataset: sanityDataset,
    apiVersion: sanityApiVersion,
    useCdn: true,
});

const builder = imageUrlBuilder(client);

export function urlFor(source: SanityImageSource) {
    return builder.image(source);
}