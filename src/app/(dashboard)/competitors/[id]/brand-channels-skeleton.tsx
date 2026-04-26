/**
 * Fallback for the lazy-loaded ChannelTabs Suspense boundary.
 * Mirrors the layout (filter row + 4-up grid) so the page does not
 * jump when the streamed content lands.
 */
function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bg-muted/60 rounded animate-pulse ${className}`} />;
}

export function BrandChannelsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Filter strip placeholder */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
        <SkeletonBar className="h-3 w-16" />
        <SkeletonBar className="h-8 w-20" />
        <SkeletonBar className="h-8 w-28" />
        <SkeletonBar className="h-8 w-32" />
      </div>

      {/* Ads grid placeholder */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBar key={i} className="h-[280px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
