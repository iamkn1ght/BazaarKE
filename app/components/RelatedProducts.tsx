import { simplifiedProduct } from "../interface";
import { client } from "../lib/sanity";
import ProductCard from "./ProductCard";

async function getRelated(category: string, excludeId: string) {
  const query = `*[_type == "product" && category->name == $category && _id != $excludeId][0...4] | order(_createdAt desc) {
        _id,
        price,
        price_minor,
        name,
        "slug": slug.current,
        "categoryName": category->name,
        "imageUrl": images[0].asset->url
    }`;
  return client.fetch<simplifiedProduct[]>(query, { category, excludeId });
}

export default async function RelatedProducts({ category, excludeId }: { category: string; excludeId: string }) {
  if (!category) return null;
  const items = await getRelated(category, excludeId);
  if (items.length === 0) return null;

  return (
    <section className="container-x border-t border-border py-16 lg:py-20">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">You may also like</h2>
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
        {items.map((p) => (
          <ProductCard key={p._id} product={p} />
        ))}
      </div>
    </section>
  );
}
