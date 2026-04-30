"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, KeyRound, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";

type Provider = "apify" | "openrouter";

interface ProviderKeyRow {
  id: string;
  provider: Provider;
  last_4: string;
  label: string | null;
  status: "active" | "invalid" | "revoked";
  last_tested_at: string | null;
  last_test_error: string | null;
}

/**
 * Settings card to manage workspace BYO keys (Apify + OpenRouter).
 * Visible only when the workspace's billing_mode = "subscription".
 * Each provider gets its own row with Save / Test / Remove.
 */
export function ProviderKeysForm({ initial }: { initial: ProviderKeyRow[] }) {
  const { t } = useT();
  const router = useRouter();
  const [keys, setKeys] = useState<ProviderKeyRow[]>(initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4 text-gold" />
          {t("settings", "providerKeysTitle")}
        </CardTitle>
        <CardDescription>
          {t("settings", "providerKeysDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProviderKeyRow
          provider="apify"
          existing={keys.find((k) => k.provider === "apify") ?? null}
          onSaved={(row) => {
            setKeys((prev) => [
              ...prev.filter((k) => k.provider !== "apify"),
              row,
            ]);
            router.refresh();
          }}
          onDeleted={() => {
            setKeys((prev) => prev.filter((k) => k.provider !== "apify"));
            router.refresh();
          }}
          onTested={(row) => {
            setKeys((prev) =>
              prev.map((k) => (k.provider === "apify" ? row : k)),
            );
          }}
        />
        <ProviderKeyRow
          provider="openrouter"
          existing={keys.find((k) => k.provider === "openrouter") ?? null}
          onSaved={(row) => {
            setKeys((prev) => [
              ...prev.filter((k) => k.provider !== "openrouter"),
              row,
            ]);
            router.refresh();
          }}
          onDeleted={() => {
            setKeys((prev) => prev.filter((k) => k.provider !== "openrouter"));
            router.refresh();
          }}
          onTested={(row) => {
            setKeys((prev) =>
              prev.map((k) => (k.provider === "openrouter" ? row : k)),
            );
          }}
        />
      </CardContent>
    </Card>
  );
}

function ProviderKeyRow({
  provider,
  existing,
  onSaved,
  onDeleted,
  onTested,
}: {
  provider: Provider;
  existing: ProviderKeyRow | null;
  onSaved: (row: ProviderKeyRow) => void;
  onDeleted: () => void;
  onTested: (row: ProviderKeyRow) => void;
}) {
  const { t } = useT();
  const [keyValue, setKeyValue] = useState("");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const providerLabel =
    provider === "apify"
      ? t("settings", "providerApify")
      : t("settings", "providerOpenRouter");

  async function save() {
    if (!keyValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/provider-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          key: keyValue.trim(),
          label: label.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? "Save failed");
        return;
      }
      toast.success(t("settings", "providerKeySaved"));
      setKeyValue("");
      onSaved(json.key as ProviderKeyRow);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch(
        `/api/settings/provider-keys/${provider}/test`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        toast.success(t("settings", "providerKeyTestOk"));
      } else {
        toast.error(`${t("settings", "providerKeyTestFail")} ${json.error ?? ""}`);
      }
      // Re-fetch the updated row to refresh status / last_tested_at
      const refresh = await fetch("/api/settings/provider-keys");
      if (refresh.ok) {
        const data = await refresh.json();
        const updated = (data.keys as ProviderKeyRow[]).find(
          (k) => k.provider === provider,
        );
        if (updated) onTested(updated);
      }
    } finally {
      setTesting(false);
    }
  }

  async function remove() {
    if (!existing) return;
    const res = await fetch(`/api/settings/provider-keys/${provider}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Remove failed");
      return;
    }
    toast.success(t("settings", "providerKeyDeleted"));
    onDeleted();
  }

  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{providerLabel}</p>
          {existing && <KeyStatusBadge row={existing} />}
        </div>
        {existing && (
          <p className="text-[11px] text-muted-foreground font-mono">
            {t("settings", "providerKeyMaskedPrefix")} <code>…{existing.last_4}</code>
            {existing.label ? ` · ${existing.label}` : ""}
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
        <Input
          type="password"
          placeholder={t("settings", "providerKeyPlaceholder")}
          value={keyValue}
          onChange={(e) => setKeyValue(e.target.value)}
        />
        <Input
          placeholder={t("settings", "providerKeyLabel")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button onClick={save} disabled={saving || !keyValue.trim()}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("settings", "providerSavingBtn")}
            </>
          ) : (
            t("settings", "providerSaveBtn")
          )}
        </Button>
      </div>

      {existing && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={test}
            disabled={testing}
          >
            {testing ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("settings", "providerTestingBtn")}
              </>
            ) : (
              t("settings", "providerTestBtn")
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={remove}>
            <Trash2 className="size-4" />
            {t("settings", "providerDeleteBtn")}
          </Button>
          {existing.status === "invalid" && existing.last_test_error && (
            <p className="text-[11px] text-red-400 ml-auto">
              {existing.last_test_error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function KeyStatusBadge({ row }: { row: ProviderKeyRow }) {
  const { t } = useT();
  if (row.status === "active" && row.last_tested_at) {
    return (
      <Badge variant="gold">
        <CheckCircle2 className="size-3" />
        {t("settings", "providerStatusActive")}
      </Badge>
    );
  }
  if (row.status === "invalid") {
    return (
      <Badge variant="muted">
        <AlertCircle className="size-3" />
        {t("settings", "providerStatusInvalid")}
      </Badge>
    );
  }
  return (
    <Badge variant="muted">
      <AlertCircle className="size-3" />
      {t("settings", "providerStatusUntested")}
    </Badge>
  );
}
