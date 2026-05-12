import type { Metadata } from "next";
import { DebugScanClient } from "./client";
import { DynamicBackLink } from "@/components/ui/dynamic-back-link";

export const metadata: Metadata = {
  title: "Debug scan Google · AISCAN",
};

export default function ScanDebugPage() {
  return (
    <div className="space-y-6">
      <DynamicBackLink fallbackHref="/dashboard" label="Dashboard" />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Debug scan Google
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {`Investiga perche' un brand risulta con 0 ads dopo uno scan
          Google. Confronta il raw count dataset Apify con i record
          finalizzati in DB e diagnostica filtri / config errata.`}
        </p>
      </div>
      <DebugScanClient />
    </div>
  );
}
