"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2 } from "lucide-react";
import { approveConsent, denyConsent } from "./actions";

/**
 * Form di consenso. Due bottoni: autorizza / rifiuta. La logica del
 * code generation + redirect e' tutta lato server (action) per non
 * esporre stato sensibile al browser.
 */
export function ConsentForm({
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
  codeChallengeMethod,
}: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await denyConsent({ redirectUri, state });
          })
        }
      >
        <X className="size-4" />
        Rifiuta
      </Button>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await approveConsent({
              clientId,
              redirectUri,
              scope,
              state,
              codeChallenge,
              codeChallengeMethod,
            });
          })
        }
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Check className="size-4" />
        )}
        Autorizza
      </Button>
    </div>
  );
}
