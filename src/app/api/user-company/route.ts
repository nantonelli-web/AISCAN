import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidVat,
  isValidSdi,
  isValidTaxCodeIT,
  isValidEmail,
  normaliseVat,
} from "@/config/company";

/**
 * GET  /api/user-company  → returns the caller's own company row
 * PUT  /api/user-company  → upserts the caller's own company row
 *
 * The table is RLS-protected so users only see their own data; the
 * route still uses the service-role client for the upsert because
 * the row may not yet exist (insert-or-update in one go), and to
 * keep the logic identical to the rest of the AISCAN write paths.
 */

// All fields are nullable on save — we accept partial drafts. The
// "complete enough" check (gating credit recharge) lives on the
// shared isCompanyComplete() helper.
const schema = z.object({
  legal_name: z.string().trim().max(200).nullable().optional(),
  country: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Z]{2}$/, "Country must be ISO-2 uppercase")
    .nullable()
    .optional(),
  vat_number: z.string().trim().max(40).nullable().optional(),
  tax_code: z.string().trim().max(40).nullable().optional(),
  address_line1: z.string().trim().max(200).nullable().optional(),
  address_line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  province: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  sdi_code: z.string().trim().max(7).nullable().optional(),
  pec_email: z.string().trim().max(200).nullable().optional(),
  billing_email: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("mait_user_company")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ company: data ?? null });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const country = input.country?.toUpperCase() ?? null;

  // Field-level validation — shape-only checks. Empty strings are
  // treated as "cleared" (saved as null) so the user can reset a
  // field they typed by mistake.
  const errors: Record<string, string> = {};

  const vat = input.vat_number?.trim() ?? "";
  if (vat && !isValidVat(vat, country)) {
    errors.vat_number = "invalid";
  }
  if (input.billing_email && !isValidEmail(input.billing_email)) {
    errors.billing_email = "invalid";
  }
  if (country === "IT") {
    if (input.sdi_code && !isValidSdi(input.sdi_code)) {
      errors.sdi_code = "invalid";
    }
    if (input.pec_email && !isValidEmail(input.pec_email)) {
      errors.pec_email = "invalid";
    }
    if (input.tax_code && !isValidTaxCodeIT(input.tax_code)) {
      errors.tax_code = "invalid";
    }
  }
  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { error: "Validation failed", fields: errors },
      { status: 400 },
    );
  }

  // Resolve the workspace from the user's profile. RLS would also
  // enforce this on insert, but reading it here lets us populate
  // the column without trusting client input.
  const adminDb = createAdminClient();
  const { data: profile } = await adminDb
    .from("mait_users")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const empty = (s: string | null | undefined) =>
    !s || s.trim() === "" ? null : s.trim();

  const row = {
    user_id: user.id,
    workspace_id: profile.workspace_id as string,
    legal_name: empty(input.legal_name ?? null),
    country,
    vat_number: vat ? normaliseVat(vat, country) : null,
    tax_code: empty(input.tax_code ?? null)?.toUpperCase() ?? null,
    address_line1: empty(input.address_line1 ?? null),
    address_line2: empty(input.address_line2 ?? null),
    city: empty(input.city ?? null),
    province: empty(input.province ?? null),
    postal_code: empty(input.postal_code ?? null),
    sdi_code:
      country === "IT" ? empty(input.sdi_code ?? null)?.toUpperCase() ?? null : null,
    pec_email:
      country === "IT" ? empty(input.pec_email ?? null)?.toLowerCase() ?? null : null,
    billing_email: empty(input.billing_email ?? null)?.toLowerCase() ?? null,
    phone: empty(input.phone ?? null),
  };

  const { data, error } = await adminDb
    .from("mait_user_company")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    console.error("[/api/user-company] upsert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ company: data });
}
