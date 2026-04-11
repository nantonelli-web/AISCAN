"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/context";

export function NewCompetitorForm() {
  const router = useRouter();
  const [pageName, setPageName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useT();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/competitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        page_name: pageName,
        page_url: pageUrl,
        country: country || null,
        category: category || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: t("newCompetitor", "error") }));
      toast.error(error);
      return;
    }
    const { id } = await res.json();
    toast.success(t("newCompetitor", "created"));
    router.push(`/competitors/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t("newCompetitor", "pageNameLabel")}</Label>
        <Input
          id="name"
          required
          value={pageName}
          onChange={(e) => setPageName(e.target.value)}
          placeholder={t("newCompetitor", "pageNamePlaceholder")}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">{t("newCompetitor", "pageUrlLabel")}</Label>
        <Input
          id="url"
          required
          type="url"
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          placeholder="https://www.facebook.com/nike"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="country">{t("newCompetitor", "countryLabel")}</Label>
          <Input
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="IT, AE, US\u2026"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">{t("newCompetitor", "categoryLabel")}</Label>
          <Input
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Fashion, E-Commerce\u2026"
          />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? t("newCompetitor", "createLoading") : t("newCompetitor", "createSubmit")}
      </Button>
    </form>
  );
}
