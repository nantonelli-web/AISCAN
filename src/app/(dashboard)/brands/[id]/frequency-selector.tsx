"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
// Calendar icon removed — inline text style now
import { useT } from "@/lib/i18n/context";

export function FrequencySelector({
  competitorId,
  initial,
}: {
  competitorId: string;
  initial: "manual" | "daily" | "weekly";
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const { t } = useT();

  const options = [
    { value: "manual" as const, label: t("frequency", "manual") },
    { value: "daily" as const, label: t("frequency", "daily") },
    { value: "weekly" as const, label: t("frequency", "weekly") },
  ];

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as typeof value;
    setValue(next);
    startTransition(async () => {
      const res = await fetch(`/api/brands/${competitorId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ frequency: next }),
      });
      if (!res.ok) {
        toast.error(t("frequency", "updateError"));
        setValue(initial);
        return;
      }
      toast.success(
        next === "manual"
          ? t("frequency", "scheduleDisabled")
          : next === "daily"
            ? t("frequency", "dailyActive")
            : t("frequency", "weeklyActive")
      );
      router.refresh();
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
      <span className="text-muted-foreground">{t("frequency", "schedule").replace(":", "")}</span>
      <select
        value={value}
        onChange={onChange}
        disabled={pending}
        className="bg-transparent text-foreground font-medium outline-none cursor-pointer disabled:opacity-50 text-xs"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-card">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
