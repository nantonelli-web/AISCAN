import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Brand detail skeleton — renders synchronously the moment the user
 * clicks a brand card so the page swap feels instant. Without this
 * the user stares at the brand list while the server fetches the
 * competitor row, ads, posts and counts in parallel before sending
 * the first byte. Mirrors the actual shape of /brands/[id]/page
 * so the visual jump on hydration is small.
 */
function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bg-muted/60 rounded animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBar className="h-4 w-40" />
        <SkeletonBar className="h-8 w-20" />
      </div>

      {/* Hero */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex items-center gap-4">
          <SkeletonBar className="size-14 rounded-full" />
          <div className="space-y-2">
            <SkeletonBar className="h-7 w-56" />
            <SkeletonBar className="h-4 w-44" />
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <SkeletonBar className="h-7 w-32" />
          <SkeletonBar className="h-7 w-32" />
          <SkeletonBar className="h-7 w-36" />
        </div>
      </section>

      {/* Scan card */}
      <Card>
        <CardHeader className="pb-3">
          <SkeletonBar className="h-3 w-24" />
        </CardHeader>
        <CardContent>
          <SkeletonBar className="h-9 w-40" />
        </CardContent>
      </Card>

      {/* Job history bar */}
      <SkeletonBar className="h-9 w-full rounded-lg" />

      {/* Channel tab strip */}
      <div className="flex items-center gap-2">
        <SkeletonBar className="h-8 w-20" />
        <SkeletonBar className="h-8 w-28" />
        <SkeletonBar className="h-8 w-32" />
      </div>

      {/* Ads grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBar key={i} className="h-[280px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
