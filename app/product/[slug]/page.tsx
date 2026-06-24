import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Truck } from "lucide-react";
import { client, urlFor } from "@/app/lib/sanity";
import { fullProduct } from "@/app/interface";
import ImageGallery from "@/app/components/imageGallery";
import AddToBag from "@/app/components/AddToBag";
import { formatKes, kesMinorToMajor, resolvePriceMinor } from "@/app/lib/rails/payment-rail/money";

async function getData(slug: string) {
    const query = `*[_type == "product" && slug.current == $slug][0] {
        _id,
        images,
        price,
        price_minor,
        name,
        description,
        "slug": slug.current,
        "categoryName": category->name,
    }`;
    return client.fetch<fullProduct | null>(query, { slug });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const data = await getData(slug);
    if (!data) return { title: "Product not found" };
    const imageUrl = data.images?.[0] ? urlFor(data.images[0]).width(1200).height(630).url() : undefined;
    return {
        title: data.name,
        description: data.description?.slice(0, 160),
        openGraph: {
            title: data.name,
            description: data.description?.slice(0, 160),
            type: "website",
            images: imageUrl ? [{ url: imageUrl, width: 1200, height: 630 }] : [],
        },
    };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const data = await getData(slug);
    if (!data) notFound();

    const priceMinor = resolvePriceMinor(data);
    const siteUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const productImage = data.images?.[0] ? urlFor(data.images[0]).url() : undefined;
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: data.name,
        description: data.description,
        image: productImage,
        category: data.categoryName,
        ...(priceMinor != null && {
            offers: {
                "@type": "Offer",
                price: kesMinorToMajor(priceMinor),
                priceCurrency: "KES",
                availability: "https://schema.org/InStock",
                url: `${siteUrl}/product/${data.slug}`,
            },
        }),
    };
    return (
        <div className="bg-white">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <div className="mx-auto max-w-screen-xl px-4 md:px-8">
                <div className="grid gap-8 md:grid-cols-2">
                    <ImageGallery images={data.images} />
                    <div className="md:py-8">
                        <div className="mb-4 md:mb-6">
                            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                {data.categoryName}
                            </span>
                            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 lg:text-3xl">
                                {data.name}
                            </h1>
                        </div>
                        <div className="mb-6">
                            {priceMinor != null ? (
                                <span className="text-2xl font-semibold text-neutral-900">
                                    {formatKes(priceMinor)}
                                </span>
                            ) : (
                                <span className="text-2xl font-semibold text-neutral-900">Price on request</span>
                            )}
                            <p className="mt-1 text-sm text-neutral-500">Incl. VAT. Shipping calculated at checkout.</p>
                        </div>
                        <div className="mb-6 flex items-center gap-2 text-neutral-600">
                            <Truck className="h-5 w-5"/>
                            <span className="text-sm">2 to 4 day delivery across Kenya</span>
                        </div>
                        <div>
                            {priceMinor != null ? (
                                <AddToBag
                                    key={data._id}
                                    id={data._id}
                                    currency="KES"
                                    description={data.description}
                                    image={data.images[0]}
                                    name={data.name}
                                    priceMinor={priceMinor}
                                />
                            ) : (
                                <Button size="lg" className="w-full sm:w-auto sm:min-w-[14rem]" disabled>
                                    Currently unavailable
                                </Button>
                            )}
                        </div>
                        <div className="mt-10 border-t border-neutral-200 pt-8">
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Details</h2>
                            <p className="mt-3 max-w-prose text-base leading-relaxed text-neutral-600">
                                {data.description}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}