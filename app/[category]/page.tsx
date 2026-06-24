import type { Metadata } from "next";
import { simplifiedProduct } from "../interface";
import { client } from "../lib/sanity";
import ProductCard from "../components/ProductCard";

async function getData(category: string) {
  const query = `*[_type == "product" && category->name == $category] {
        _id,
        "imageUrl": images[0].asset->url,
        price,
        price_minor,
        name,
        "slug": slug.current,
        "categoryName": category->name
    }`;
  return client.fetch<simplifiedProduct[]>(query, { category });
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  return {
    title: category,
    description: `Browse ${category} at Unique Accessories.`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const data = await getData(category);

  return (
    <div className="container-x py-12 lg:py-16">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">{category}</h1>
        <p className="mt-3 text-neutral-600">
          {data.length} {data.length === 1 ? "product" : "products"} in {category}.
        </p>
      </header>

      {data.length === 0 ? (
        <p className="mt-12 text-sm text-neutral-500">No products in this category yet.</p>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {data.map((product, i) => (
            <ProductCard key={product._id} product={product} priority={i < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
