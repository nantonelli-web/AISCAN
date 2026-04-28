import { CostsContent } from "./costs-content";

export const dynamic = "force-dynamic";

export default function AdminCostsPage() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-serif tracking-tight">
          Cost Management
        </h1>
        <p className="text-sm text-muted-foreground">
          Month-to-date spend on the two paid upstream services AISCAN
          consumes — OpenRouter (LLM) and Apify (scrapers).
        </p>
      </div>

      <CostsContent />
    </div>
  );
}
