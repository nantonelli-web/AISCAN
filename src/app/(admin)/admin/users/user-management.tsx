"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Search, Coins, X, Ban, CircleCheck, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  workspace_id: string | null;
  workspace_name: string;
  credits_balance: number;
  created_at: string;
  disabled: boolean;
}

export function UserManagement({ users }: { users: User[] }) {
  const [search, setSearch] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [userList, setUserList] = useState(users);

  const filtered = userList.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.name ?? "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    );
  });

  async function handleCreditSubmit(userId: string) {
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount === 0) {
      toast.error("Enter a valid non-zero amount");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, amount: numAmount, reason: reason.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        toast.error(data.error || "Failed to adjust credits");
        setLoading(false);
        return;
      }

      toast.success(
        `Credits ${numAmount > 0 ? "added" : "removed"} successfully`
      );

      // Update the local user list with the authoritative balance returned
      // by the route (field is `balance`; the old `newBalance` never existed
      // so this always fell back to a client-side estimate).
      setUserList((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, credits_balance: data.balance ?? u.credits_balance + numAmount }
            : u
        )
      );

      setEditingUserId(null);
      setAmount("");
      setReason("");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function toggleDisabled(user: User) {
    const next = !user.disabled;
    setBusyId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, disabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || "Failed to update user");
        return;
      }
      toast.success(next ? "User disabled" : "User enabled");
      setUserList((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, disabled: next } : u))
      );
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(user: User) {
    const ok = window.confirm(
      `Delete ${user.email} permanently?\n\nThis removes the account and its credit history. It cannot be undone. Workspace data (brands, ads) is kept.`
    );
    if (!ok) return;
    setBusyId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error(data.error || "Failed to delete user");
        return;
      }
      toast.success("User deleted");
      setUserList((prev) => prev.filter((u) => u.id !== user.id));
      if (editingUserId === user.id) setEditingUserId(null);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-sm">
          {userList.length} users
        </CardTitle>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border divide-y divide-border">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1.5fr_0.6fr_1fr_0.6fr_0.8fr_auto] gap-3 px-4 py-2 text-xs text-muted-foreground font-medium">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Workspace</span>
            <span className="text-right">Credits</span>
            <span className="text-right">Joined</span>
            <span className="text-right">Actions</span>
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No users found
            </div>
          ) : (
            filtered.map((user) => (
              <div key={user.id}>
                <div
                  className={`grid grid-cols-[1fr_1.5fr_0.6fr_1fr_0.6fr_0.8fr_auto] gap-3 px-4 py-2.5 text-sm items-center ${
                    user.disabled ? "opacity-60" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-medium">
                      {user.name || "—"}
                    </span>
                    {user.disabled && (
                      <Badge variant="muted" className="shrink-0">
                        Disabled
                      </Badge>
                    )}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {user.email}
                  </span>
                  <span>
                    <Badge variant={user.role === "admin" ? "gold" : "muted"}>
                      {user.role || "member"}
                    </Badge>
                  </span>
                  <span className="truncate text-muted-foreground">
                    {user.workspace_name}
                  </span>
                  <span className="text-right font-medium text-gold">
                    {user.credits_balance}
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    {formatDate(user.created_at)}
                  </span>
                  <span className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditingUserId(
                          editingUserId === user.id ? null : user.id
                        )
                      }
                    >
                      <Coins className="size-3" />
                      Credits
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={busyId === user.id}
                      title={user.disabled ? "Enable user" : "Disable user"}
                      onClick={() => toggleDisabled(user)}
                    >
                      {user.disabled ? (
                        <CircleCheck className="size-4" />
                      ) : (
                        <Ban className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={busyId === user.id}
                      title="Delete user"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(user)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>

                {/* Inline credit form */}
                {editingUserId === user.id && (
                  <div className="px-4 py-3 bg-muted/50 border-t border-border">
                    <div className="flex items-end gap-3 max-w-xl">
                      <div className="space-y-1.5 flex-shrink-0">
                        <Label className="text-xs">Amount</Label>
                        <Input
                          type="number"
                          placeholder="+10 or -5"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-28"
                        />
                      </div>
                      <div className="space-y-1.5 flex-1">
                        <Label className="text-xs">Reason</Label>
                        <Input
                          placeholder="e.g. Manual top-up"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={loading}
                        onClick={() => handleCreditSubmit(user.id)}
                      >
                        {loading ? "Saving..." : "Apply"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingUserId(null);
                          setAmount("");
                          setReason("");
                        }}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
