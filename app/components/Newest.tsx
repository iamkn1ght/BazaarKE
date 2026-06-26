import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { simplifiedProduct } from "../interface";
import { client } from "../lib/sanity";
import ProductCard from "./ProductCard";

async function getData() {
  // order BEFORE slicing, or the "newest 8" are actually the first 8 in default order, then sorted.
  const query = `*[_type == "product" && defined(images[0].asset)] | order(_createdAt desc)[0...8] {
        _id,
        price,
        price_minor,
        name,
        "slug": slug.current,
        "categoryName": category->name,
        "imageUrl": images[0].asset->url
    }`;
  // Degrade gracefully: a Sanity hiccup must not crash the prerender / fail the build. ISR refills it.
  try {
    return await client.fetch<simplifiedProduct[]>(query);
  } catch (err) {
    console.error("[home] Newest fetch failed; rendering empty:", err instanceof Error ? err.message : err);
    return [];
  }
}

export default async function Newest() {
  const data = await getData();

  return (
    <section className="container-x py-16 lg:py-24">
      <div className="flex items-end justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">New arrivals</h2>
        <Link
          href="/all"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-foreground"
        >
          View all
          <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-soft group-hover:translate-x-0.5" />
        </Link>
      </div>

      {data.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No products yet. Check back soon.</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {data.map((product, i) => (
            <ProductCard key={product._id} product={product} priority={i < 4} />
          ))}
        </div>
      )}
    </section>
  );
}
