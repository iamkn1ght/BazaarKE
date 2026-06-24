import ProductGridSkeleton from "../components/ProductGridSkeleton";

export default function Loading() {
  return (
    <div className="container-x py-12 lg:py-16">
      <div className="h-9 w-56 rounded bg-muted motion-safe:animate-pulse" />
      <div className="mt-3 h-4 w-80 max-w-full rounded bg-muted motion-safe:animate-pulse" />
      <div className="mt-8 h-12 w-full rounded bg-muted motion-safe:animate-pulse" />
      <ProductGridSkeleton />
    </div>
  );
}
