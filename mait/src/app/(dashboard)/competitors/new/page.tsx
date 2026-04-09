import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { NewCompetitorForm } from "./form";

export default function NewCompetitorPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">Aggiungi competitor</h1>
        <p className="text-sm text-muted-foreground">
          Inserisci l&apos;URL pagina Facebook o Meta Ad Library del competitor.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dettagli</CardTitle>
          <CardDescription>
            Il primo scraping può essere lanciato dopo la creazione.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewCompetitorForm />
        </CardContent>
      </Card>
    </div>
  );
}
