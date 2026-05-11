"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BatchScanGoogleModal } from "./batch-scan-google-modal";

interface BrandRow {
  id: string;
  page_name: string | null;
  google_advertiser_id: string | null;
  google_domain: string | null;
  last_scraped_at: string | null;
}

/**
 * Trigger button per il batch scan Google Ads. Renderizzato nella
 * header della /brands page accanto al CTA "Aggiungi competitor".
 * Cliente component standalone cosi possiamo aprire il modal con
 * stato locale senza convertire la list page intera a client.
 */
export function BatchScanTrigger({ brands }: { brands: BrandRow[] }) {
  const [open, setOpen] = useState(false);
  const googleEligible = brands.filter(
    (b) => !!(b.google_advertiser_id || b.google_domain),
  );
  if (googleEligible.length < 2) return null; // serve almeno 2 per parlare di batch
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <Layers className="size-4" />
        Batch scan Google
      </Button>
      {open && (
        <BatchScanGoogleModal
          brands={brands}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
