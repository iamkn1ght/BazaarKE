import { simplifiedProduct } from "../interface";
import { client } from "../lib/sanity";
import ProductCard from "../components/ProductCard";

export const metadata = {
  title: "All Products — Unique Accessories",
  description: "Browse every product in the Unique Accessories catalog.",
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

  return (
    <div className="container-x py-12 lg:py-16">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">All products</h1>
        <p className="mt-3 text-neutral-600">Every product in the Unique Accessories catalog.</p>
      </header>

      {data.length === 0 ? (
        <p className="mt-12 text-sm text-neutral-500">No products yet. Check back soon.</p>
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
