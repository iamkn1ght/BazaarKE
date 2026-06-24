"use client";

import { useMemo, useState } from "react";
import type { simplifiedProduct } from "../interface";
import { resolvePriceMinor } from "../lib/rails/payment-rail/money";
import ProductCard from "./ProductCard";

type Sort = "new" | "price-asc" | "price-desc";

export default function ProductExplorer({
  products,
  categories,
}: {
  products: simplifiedProduct[];
  categories?: string[];
}) {
  const [sort, setSort] = useState<Sort>("new");
  const [cat, setCat] = useState<string>("All");
  const showFilter = (categories?.length ?? 0) > 1;

  const list = useMemo(() => {
    let l = products;
    if (showFilter && cat !== "All") l = l.filter((p) => p.categoryName === cat);
    if (sort === "price-asc") {
      l = [...l].sort((a, b) => (resolvePriceMinor(a) ?? Infinity) - (resolvePriceMinor(b) ?? Infinity));
    } else if (sort === "price-desc") {
      l = [...l].sort((a, b) => (resolvePriceMinor(b) ?? -1) - (resolvePriceMinor(a) ?? -1));
    }
    return l;
  }, [products, cat, sort, showFilter]);

  return (
    <div>
      <div className="mt-8 flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
        {showFilter ? (
          <div className="flex flex-wrap gap-2">
            {["All", ...(categories ?? [])].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  cat === c ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">
            {list.length} {list.length === 1 ? "product" : "products"}
          </span>
        )}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="new">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
      </div>

      {list.length === 0 ? (
        <p className="mt-12 text-sm text-muted-foreground">No products match.</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p, i) => (
            <ProductCard key={p._id} product={p} priority={i < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
