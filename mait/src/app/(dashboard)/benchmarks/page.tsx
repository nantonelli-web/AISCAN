import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function BenchmarksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Benchmarks</h1>
        <p className="text-sm text-muted-foreground">
          Confronto interno vs. mercato (competitor scraping).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>In arrivo (Phase 2)</CardTitle>
          <CardDescription>
            Volume ads, format mix, CTA analysis, copy length, landing patterns.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
