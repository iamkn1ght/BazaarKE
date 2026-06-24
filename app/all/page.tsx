import { simplifiedProduct } from "../interface";
import { client } from "../lib/sanity";
import ProductExplorer from "../components/ProductExplorer";

export const metadata = {
  title: "All products | BazaarKE",
  description: "Browse every product in the BazaarKE catalog.",
};

async function getData() {
  const query = `*[_type == "product"] | order(_createdAt desc) {
        _id,
        price,
        price_minor,
        name,
        "slug": slug.current,
        "categoryName": category->name,
        "imageUrl": images[0].asset->url
    }`;
  return client.fetch<simplifiedProduct[]>(query);
}

export default async function AllProductsPage() {
  const data = await getData();
  const categories = Array.from(new Set(data.map((p) => p.categoryName).filter(Boolean))).sort();

  return (
    <div className="container-x py-12 lg:py-16">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">All products</h1>
        <p className="mt-3 text-muted-foreground">Every product in the BazaarKE catalog.</p>
      </header>

      {data.length === 0 ? (
        <p className="mt-12 text-sm text-muted-foreground">No products yet. Check back soon.</p>
      ) : (
        <ProductExplorer products={data} categories={categories} />
      )}
    </div>
  );
}
