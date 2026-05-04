"use client";

import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Input + small "open in new tab" affordance on the right.
 *
 * Originally lived inside the new-brand form; promoted to a shared
 * component so the edit form can use the same affordance without
 * duplicating the markup. Used everywhere the user types a social
 * handle / URL and would want a one-click way to verify the
 * resolved profile lives where we think it does.
 *
 * The verify icon sits inside the input (absolute pos) instead of
 * as a sibling button so the field takes the same grid slot as a
 * plain Input — keeps form rhythm consistent with non-verify rows.
 * When `verifyHref` is null (empty field) the icon is greyed out
 * and disabled, so the user gets a visual hint that there is
 * nothing to check yet.
 */
export function FieldWithVerifyLink({
  id,
  value,
  onChange,
  placeholder,
  type,
  verifyHref,
  verifyLabel,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  /** URL to open in a new tab when the user clicks the icon.
   *  null = field empty, icon disabled. */
  verifyHref: string | null;
  verifyLabel: string;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <a
        href={verifyHref ?? "#"}
        target={verifyHref ? "_blank" : undefined}
        rel="noreferrer"
        aria-label={verifyLabel}
        title={verifyLabel}
        onClick={(e) => {
          if (!verifyHref) e.preventDefault();
        }}
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 size-7 rounded-md grid place-items-center transition-colors",
          verifyHref
            ? "text-muted-foreground hover:text-gold hover:bg-muted cursor-pointer"
            : "text-muted-foreground/30 cursor-not-allowed",
        )}
      >
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}
