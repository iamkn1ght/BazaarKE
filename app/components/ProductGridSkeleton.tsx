/** Skeleton matching the product-card grid shape; shown via route loading.tsx during data fetch. */
export default function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-4">
          <div className="aspect-[4/5] w-full rounded-lg bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}
