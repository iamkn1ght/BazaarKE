export default function Loading() {
  return (
    <div className="bg-background">
      <div className="mx-auto max-w-screen-xl px-4 md:px-8">
        <div className="py-6">
          <div className="h-4 w-48 rounded bg-muted motion-safe:animate-pulse" />
        </div>
        <div className="grid gap-8 md:grid-cols-2 lg:items-start">
          <div className="aspect-square w-full rounded-lg bg-muted motion-safe:animate-pulse" />
          <div className="space-y-5 md:py-8">
            <div className="h-3 w-24 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-8 w-3/4 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-7 w-32 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-5 w-56 rounded bg-muted motion-safe:animate-pulse" />
            <div className="h-11 w-full max-w-[14rem] rounded-md bg-muted motion-safe:animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
