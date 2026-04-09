import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Performance Analytics</h1>
        <p className="text-sm text-muted-foreground">
          KPI campagne gestite via Meta Marketing API.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>In arrivo (Phase 1.1)</CardTitle>
          <CardDescription>
            Connessione OAuth Meta Business Manager + sync automatico ogni 6h.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sezione disponibile dopo aver collegato un Ad Account Meta.
        </CardContent>
      </Card>
    </div>
  );
}
