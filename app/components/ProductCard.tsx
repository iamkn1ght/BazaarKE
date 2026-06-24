import Link from "next/link";
import Image from "next/image";
import { priceLabel } from "../lib/rails/payment-rail/money";
import type { simplifiedProduct } from "../interface";

/**
 * Image-forward, minimal-chrome product card (New Balance / Adidas editorial style):
 * large image, hover-zoom, sparse text. Shared by Newest / Explorer. Scroll-reveals via the
 * .reveal-up CSS utility (view-timeline; no-op when reduced motion or unsupported).
 */
export default function ProductCard({
  product,
  priority = false,
}: {
  product: simplifiedProduct;
  priority?: boolean;
}) {
  return (
    <Link href={`/product/${product.slug}`} className="group block reveal-up">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-muted">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          priority={priority}
          className="object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-105"
        />
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-foreground">{product.name}</h3>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{product.categoryName}</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-foreground">{priceLabel(product)}</p>
      </div>
    </Link>
  );
}
