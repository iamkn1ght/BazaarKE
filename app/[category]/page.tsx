import type { Metadata } from "next";
import { simplifiedProduct } from "../interface";
import { client } from "../lib/sanity";
import ProductExplorer from "../components/ProductExplorer";

export const revalidate = 300; // ISR — keep category pages fresh + resilient to a Sanity hiccup.

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
  try {
    return await client.fetch<simplifiedProduct[]>(query, { category });
  } catch (err) {
    console.error("[category] Sanity fetch failed; rendering empty:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  return {
    title: category,
    description: `Browse ${category} at BazaarKE.`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const data = await getData(category);

  return (
    <div className="container-x py-12 lg:py-16">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{category}</h1>
        <p className="mt-3 text-muted-foreground">Shop our {category.toLowerCase()} range.</p>
      </header>

      {data.length === 0 ? (
        <p className="mt-12 text-sm text-muted-foreground">No products in this category yet.</p>
      ) : (
        <ProductExplorer products={data} />
      )}
    </div>
  );
}
