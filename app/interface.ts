import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

export interface simplifiedProduct {
    _id: string;
    imageUrl: string;
    price: number;
    slug: string;
    categoryName: string;
    name: string;
}

export interface fullProduct {
    _id: string;
    images: SanityImageSource[];
    price: number;
    slug: string;
    name: string;
    description: string;
    categoryName: string;
}