import { LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MaitUser } from "@/types";

export function Header({
  profile,
  workspaceName,
}: {
  profile: MaitUser;
  workspaceName: string;
}) {
  const initials = (profile.name || profile.email)
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Workspace
        </span>
        <span className="font-medium">{workspaceName}</span>
        <Badge variant="gold">{profile.role.replace("_", " ")}</Badge>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <div className="text-sm font-medium">{profile.name || profile.email}</div>
          <div className="text-xs text-muted-foreground">{profile.email}</div>
        </div>
        <div className="size-9 rounded-full bg-gold/15 border border-gold/30 grid place-items-center text-gold text-xs font-semibold">
          {initials}
        </div>
        <form action="/api/auth/signout" method="post">
          <button
            type="submit"
            className="size-9 rounded-md border border-border hover:bg-muted grid place-items-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </header>
  );
}
