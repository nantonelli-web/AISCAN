"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    const res = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Errore nell'accettare l'invito.");
      setLoading(false);
      return;
    }
    toast.success("Invito accettato!");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Button onClick={accept} disabled={loading} className="w-full">
      {loading ? "Accettazione..." : "Accetta invito"}
    </Button>
  );
}
