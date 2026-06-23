import type { MetadataRoute } from "next";
import { client } from "./lib/sanity";

interface SitemapRow {
    slug: string;
    updatedAt: string;
}

async function getProducts(): Promise<SitemapRow[]> {
    return client.fetch(`*[_type == "product" && defined(slug.current)] {
        "slug": slug.current,
        "updatedAt": _updatedAt
    }`);
}

async function getCategories(): Promise<{ name: string }[]> {
    return client.fetch(`*[_type == "category" && defined(name)] { name }`);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const now = new Date();

    const staticRoutes: MetadataRoute.Sitemap = [
        { url: `${baseUrl}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
        { url: `${baseUrl}/all`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    ];

    const [products, categories] = await Promise.all([getProducts(), getCategories()]);

    const productRoutes: MetadataRoute.Sitemap = products.map((p) => ({
        url: `${baseUrl}/product/${p.slug}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
        changeFrequency: "weekly",
        priority: 0.8,
    }));

    const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
        url: `${baseUrl}/${encodeURIComponent(c.name)}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
    }));

    return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
