import { Card, CardContent, CardHeader } from "@/components/ui/card";

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`bg-muted/60 rounded animate-pulse ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-40" />
          <SkeletonBar className="h-4 w-72" />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SkeletonBar className="h-8 w-24" />
        <SkeletonBar className="h-8 w-28" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SkeletonBar className="h-7 w-24" />
        <SkeletonBar className="h-7 w-28" />
        <SkeletonBar className="h-7 w-32" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-2">
              <SkeletonBar className="h-3 w-16" />
              <SkeletonBar className="h-7 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <SkeletonBar className="h-[300px] w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SkeletonBar className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonBar key={i} className="h-[260px]" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
