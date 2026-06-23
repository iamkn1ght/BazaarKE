import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Star, Truck } from "lucide-react";
import { client, urlFor } from "@/app/lib/sanity";
import { fullProduct } from "@/app/interface";
import ImageGallery from "@/app/components/imageGallery";
import AddToBag from "@/app/components/AddToBag";
import { formatKes, kesMinorToMajor } from "@/app/lib/rails/payment-rail/money";

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

    const priceMinor = data.price_minor ?? Math.round(data.price * 100);
    const siteUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const productImage = data.images?.[0] ? urlFor(data.images[0]).url() : undefined;
    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: data.name,
        description: data.description,
        image: productImage,
        category: data.categoryName,
        offers: {
            "@type": "Offer",
            price: kesMinorToMajor(priceMinor),
            priceCurrency: "KES",
            availability: "https://schema.org/InStock",
            url: `${siteUrl}/product/${data.slug}`,
        },
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
                        <div className="mb-2 md:mb-3">
                            <span className="mb-0.5 inline-block text-gray-500">
                                {data.categoryName}
                            </span>
                            <h2 className="text-2xl font-bold text-gray-800 lg:text-3xl">
                                {data.name}
                            </h2>
                        </div>
                        <div className="mb-6 flex items-center gap-3 md:mb-10">
                            <Button className="rounded-full gap-x-2">
                                <span className="text-sm">4.2</span>
                                <Star className="h-5 w-5"/>
                            </Button>
                            <span className="text-sm text-gray-500 transition duration-100">43 Ratings</span>
                        </div>
                        <div className="mb-4">
                            <div className="flex items-end gap-2">
                                <span className="text-xl font-bold text-gray-800 md:text-2xl">
                                    {formatKes(priceMinor)}
                                </span>
                                <span className="mb-0.5 text-red-500 line-through">
                                    {formatKes(priceMinor + 3000)}
                                </span>
                            </div>
                            <span className="text-sm text-gray-500">
                                Incl. VAT plus Shipping
                            </span>
                        </div>
                        <div className="mb-6 flex items-center gap-2 text-gray-500">
                            <Truck className="w-6 h-6"/>
                            <span className="text-sm">2-4 Day Shipping</span>
                        </div>
                        <div className="flex gap-2.5">
                            <AddToBag
                                key={data._id}
                                id={data._id}
                                currency="KES"
                                description={data.description}
                                image={data.images[0]}
                                name={data.name}
                                priceMinor={priceMinor}
                            />
                            
                        </div>
                        <p className="mt-12 text-base text-gray-500 tracking-wide">
                            {data.description}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}