"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Pencil,
  Save,
  X as XIcon,
  ToggleLeft,
  ToggleRight,
  Cpu,
} from "lucide-react";
import { toast } from "sonner";

interface AIModel {
  id: string;
  provider: string;
  model_id: string;
  display_name: string;
  credits_cost: number;
  is_active: boolean;
  openrouter_id: string | null;
  supports_vision: boolean;
  last_synced_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModel, setEditModel] = useState<AIModel | null>(null);
  const [editName, setEditName] = useState("");
  const [editCost, setEditCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  async function fetchModels() {
    try {
      const res = await fetch("/api/admin/models", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Load failed");
      setModels((data.models ?? []) as AIModel[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchModels();
  }, []);

  async function toggleActive(model: AIModel) {
    try {
      const res = await fetch(`/api/admin/models/${model.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: !model.is_active }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Update failed");
        return;
      }
      toast.success(
        model.is_active
          ? `Disattivato: ${model.display_name}`
          : `Attivato: ${model.display_name}`,
      );
      fetchModels();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  async function handleSaveEdit() {
    if (!editModel) return;
    const cost = Number.parseInt(editCost, 10);
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Costo crediti non valido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/models/${editModel.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: editName,
          credits_cost: cost,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error ?? "Save failed");
        return;
      }
      toast.success("Modello aggiornato");
      setEditModel(null);
      fetchModels();
    } finally {
      setSaving(false);
    }
  }

  function openEdit(model: AIModel) {
    setEditModel(model);
    setEditName(model.display_name);
    setEditCost(String(model.credits_cost));
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeModels = models.filter((m) => m.is_active);
  const inactiveModels = models.filter((m) => !m.is_active);
  const providers = [
    ...new Set(activeModels.map((m) => m.provider).sort()),
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-info-soft tone-info grid place-items-center shrink-0">
          <Cpu className="size-5" />
        </div>
        <div className="space-y-0.5">
          <p className="eyebrow">ADMIN</p>
          <h1 className="text-3xl font-serif tracking-tight">Modelli LLM</h1>
          <p className="text-sm text-muted-foreground">
            Catalogo dei modelli AI disponibili: attivazione, costo crediti
            per chiamata, sync con OpenRouter.
          </p>
        </div>
      </header>

      {/* Active models per provider */}
      {providers.map((provider) => {
        const providerModels = activeModels.filter(
          (m) => m.provider === provider,
        );
        if (providerModels.length === 0) return null;
        return (
          <Card key={provider}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-semibold capitalize">
                  {provider}
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {providerModels.length} modell
                  {providerModels.length === 1 ? "o" : "i"} attiv
                  {providerModels.length === 1 ? "o" : "i"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 font-semibold">Modello</th>
                      <th className="text-left py-2 font-semibold">
                        Model ID
                      </th>
                      <th className="text-left py-2 font-semibold">
                        OpenRouter
                      </th>
                      <th className="text-right py-2 font-semibold">Costo</th>
                      <th className="text-left py-2 font-semibold">Vision</th>
                      <th className="text-left py-2 font-semibold">
                        Ultimo sync
                      </th>
                      <th className="text-right py-2 font-semibold">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {providerModels.map((m) => (
                      <tr key={m.id} className="hover:bg-muted/30">
                        <td className="py-2.5 font-medium">{m.display_name}</td>
                        <td className="py-2.5">
                          <code className="text-[11px] bg-muted px-2 py-0.5 rounded">
                            {m.model_id}
                          </code>
                        </td>
                        <td className="py-2.5 text-[11px] text-muted-foreground">
                          {m.openrouter_id ?? "—"}
                        </td>
                        <td className="text-right py-2.5">
                          <Badge variant="gold" className="text-[10px]">
                            {m.credits_cost} cr
                          </Badge>
                        </td>
                        <td className="py-2.5 text-[11px]">
                          {m.supports_vision ? "✓" : "—"}
                        </td>
                        <td className="py-2.5 text-[11px] text-muted-foreground">
                          {m.last_synced_at
                            ? new Date(m.last_synced_at).toLocaleDateString(
                                "it-IT",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                },
                              )
                            : "—"}
                        </td>
                        <td className="text-right py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(m)}
                              className="size-8 p-0"
                              title="Modifica"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleActive(m)}
                              className="size-8 p-0 text-emerald-500 hover:text-rose-400"
                              title="Disattiva"
                            >
                              <ToggleRight className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {activeModels.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nessun modello attivo. Riattiva un modello dalla sezione
            disattivati o aggiungine uno nuovo via SQL.
          </CardContent>
        </Card>
      )}

      {/* Inactive models — collapsible */}
      {inactiveModels.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-muted-foreground">
                Modelli disattivati ({inactiveModels.length})
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowInactive((s) => !s)}
              >
                {showInactive ? "Nascondi" : "Mostra"}
              </Button>
            </div>
            {showInactive && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 font-semibold">
                        Provider
                      </th>
                      <th className="text-left py-2 font-semibold">Modello</th>
                      <th className="text-left py-2 font-semibold">
                        Model ID
                      </th>
                      <th className="text-right py-2 font-semibold">Costo</th>
                      <th className="text-right py-2 font-semibold">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {inactiveModels.map((m) => (
                      <tr key={m.id} className="opacity-60 hover:opacity-100 transition-opacity">
                        <td className="py-2.5 capitalize">{m.provider}</td>
                        <td className="py-2.5 font-medium">{m.display_name}</td>
                        <td className="py-2.5">
                          <code className="text-[11px] bg-muted px-2 py-0.5 rounded">
                            {m.model_id}
                          </code>
                        </td>
                        <td className="text-right py-2.5">
                          <Badge variant="outline" className="text-[10px]">
                            {m.credits_cost} cr
                          </Badge>
                        </td>
                        <td className="text-right py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(m)}
                              className="size-8 p-0"
                              title="Modifica"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleActive(m)}
                              className="gap-1.5"
                              title="Riattiva"
                            >
                              <ToggleLeft className="size-3.5" />
                              Riattiva
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit modal */}
      {editModel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Modifica modello</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {editModel.provider} · {editModel.model_id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditModel(null)}
                  className="size-8 rounded-md grid place-items-center text-muted-foreground hover:bg-muted"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="m-name">Nome visualizzato</Label>
                  <Input
                    id="m-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-cost">Costo in crediti</Label>
                  <Input
                    id="m-cost"
                    type="number"
                    min={0}
                    max={1000}
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                  />
                </div>
                {editModel.openrouter_id && (
                  <div className="rounded-md bg-muted p-2.5 text-[11px] text-muted-foreground">
                    OpenRouter:{" "}
                    <code className="bg-background px-1.5 py-0.5 rounded">
                      {editModel.openrouter_id}
                    </code>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModel(null)}
                >
                  Annulla
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Save className="size-3.5" />
                  )}
                  Salva
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
