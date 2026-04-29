"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/context";
import { getCountries } from "@/config/countries";
import {
  isValidVat,
  isValidSdi,
  isValidTaxCodeIT,
  isValidEmail,
  isCompanyComplete,
  type UserCompany,
} from "@/config/company";

const EMPTY: UserCompany = {
  legal_name: null,
  country: null,
  vat_number: null,
  tax_code: null,
  address_line1: null,
  address_line2: null,
  city: null,
  province: null,
  postal_code: null,
  sdi_code: null,
  pec_email: null,
  billing_email: null,
  phone: null,
};

type FieldErrors = Partial<Record<keyof UserCompany, string>>;

/**
 * Settings → Azienda card. The user's own company / fiscal data.
 * Two columns on >= sm, conditional Italian e-invoicing block.
 */
export function CompanyForm({ initial }: { initial: UserCompany | null }) {
  const router = useRouter();
  const { t, locale } = useT();
  const [form, setForm] = useState<UserCompany>(initial ?? EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const countries = useMemo(() => getCountries(locale), [locale]);
  const isIT = form.country === "IT";
  const complete = isCompanyComplete(form);

  function setField<K extends keyof UserCompany>(key: K, value: UserCompany[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // Clear field-level error as soon as the user edits it.
    if (errors[key]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (form.vat_number && !isValidVat(form.vat_number, form.country)) {
      errs.vat_number = t("company", "vatInvalid");
    }
    if (form.billing_email && !isValidEmail(form.billing_email)) {
      errs.billing_email = t("company", "billingEmailInvalid");
    }
    if (isIT) {
      if (form.sdi_code && !isValidSdi(form.sdi_code)) {
        errs.sdi_code = t("company", "sdiInvalid");
      }
      if (form.pec_email && !isValidEmail(form.pec_email)) {
        errs.pec_email = t("company", "pecInvalid");
      }
      if (form.tax_code && !isValidTaxCodeIT(form.tax_code)) {
        errs.tax_code = t("company", "taxCodeInvalid");
      }
    }
    return errs;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const local = validate();
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/user-company", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json?.fields) {
          // Server-side field errors map to localised messages.
          const mapped: FieldErrors = {};
          for (const k of Object.keys(json.fields) as (keyof UserCompany)[]) {
            const err = json.fields[k];
            if (err === "invalid") {
              if (k === "vat_number") mapped[k] = t("company", "vatInvalid");
              else if (k === "billing_email") mapped[k] = t("company", "billingEmailInvalid");
              else if (k === "sdi_code") mapped[k] = t("company", "sdiInvalid");
              else if (k === "pec_email") mapped[k] = t("company", "pecInvalid");
              else if (k === "tax_code") mapped[k] = t("company", "taxCodeInvalid");
            }
          }
          setErrors(mapped);
        }
        toast.error(json?.error ?? t("company", "saveError"));
        return;
      }
      toast.success(t("company", "saved"));
      // Echo back the normalised row from the server (e.g. VAT
      // stripped of prefix, emails lowercased) so the UI reflects
      // exactly what's stored.
      if (json.company) setForm(json.company as UserCompany);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // Stable bind helper so each input shows the current value as a
  // string (the table stores nullables) and writes back nullable.
  const bind = <K extends keyof UserCompany>(key: K) => ({
    value: (form[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setField(key, (e.target.value === "" ? null : e.target.value) as UserCompany[K]),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-gold" />
              {t("company", "title")}
            </CardTitle>
            <CardDescription>{t("company", "description")}</CardDescription>
          </div>
          {complete ? (
            <Badge variant="gold" className="shrink-0">
              <CheckCircle2 className="size-3" />
              {t("company", "completeNotice")}
            </Badge>
          ) : (
            <Badge variant="muted" className="shrink-0">
              <AlertCircle className="size-3" />
              {t("company", "incompleteNotice")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          {/* — Anagrafica — */}
          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("company", "sectionLegal")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="co-legal_name">{t("company", "legalNameLabel")}</Label>
                <Input
                  id="co-legal_name"
                  placeholder={t("company", "legalNamePlaceholder")}
                  {...bind("legal_name")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="co-country">{t("company", "countryLabel")}</Label>
                <select
                  id="co-country"
                  value={form.country ?? ""}
                  onChange={(e) =>
                    setField("country", (e.target.value || null) as UserCompany["country"])
                  }
                  className="flex h-9 w-full rounded-md border border-border bg-muted px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <option value="">{t("company", "countryPlaceholder")}</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="co-vat">{t("company", "vatLabel")}</Label>
                <Input
                  id="co-vat"
                  placeholder={t("company", "vatPlaceholder")}
                  {...bind("vat_number")}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("company", "vatHint")}
                </p>
                {errors.vat_number && (
                  <p className="text-[11px] text-red-400">{errors.vat_number}</p>
                )}
              </div>

              {isIT && (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="co-tax_code">{t("company", "taxCodeLabel")}</Label>
                  <Input id="co-tax_code" {...bind("tax_code")} />
                  <p className="text-[11px] text-muted-foreground">
                    {t("company", "taxCodeHint")}
                  </p>
                  {errors.tax_code && (
                    <p className="text-[11px] text-red-400">{errors.tax_code}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* — Indirizzo — */}
          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("company", "sectionAddress")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="co-addr1">{t("company", "addressLine1Label")}</Label>
                <Input
                  id="co-addr1"
                  placeholder={t("company", "addressLine1Placeholder")}
                  {...bind("address_line1")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="co-addr2">{t("company", "addressLine2Label")}</Label>
                <Input
                  id="co-addr2"
                  placeholder={t("company", "addressLine2Placeholder")}
                  {...bind("address_line2")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-city">{t("company", "cityLabel")}</Label>
                <Input id="co-city" {...bind("city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-province">{t("company", "provinceLabel")}</Label>
                <Input id="co-province" {...bind("province")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-zip">{t("company", "postalCodeLabel")}</Label>
                <Input id="co-zip" {...bind("postal_code")} />
              </div>
            </div>
          </section>

          {/* — Fatturazione elettronica IT — */}
          {isIT && (
            <section className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("company", "sectionEInvoice")}
              </h3>
              <p className="text-[11px] text-muted-foreground -mt-1">
                {t("company", "eInvoiceHint")}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="co-sdi">{t("company", "sdiLabel")}</Label>
                  <Input
                    id="co-sdi"
                    placeholder={t("company", "sdiPlaceholder")}
                    {...bind("sdi_code")}
                  />
                  {errors.sdi_code && (
                    <p className="text-[11px] text-red-400">{errors.sdi_code}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="co-pec">{t("company", "pecLabel")}</Label>
                  <Input
                    id="co-pec"
                    type="email"
                    placeholder={t("company", "pecPlaceholder")}
                    {...bind("pec_email")}
                  />
                  {errors.pec_email && (
                    <p className="text-[11px] text-red-400">{errors.pec_email}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* — Contatti — */}
          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("company", "sectionContact")}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="co-billing_email">
                  {t("company", "billingEmailLabel")}
                </Label>
                <Input
                  id="co-billing_email"
                  type="email"
                  placeholder={t("company", "billingEmailPlaceholder")}
                  {...bind("billing_email")}
                />
                {errors.billing_email && (
                  <p className="text-[11px] text-red-400">{errors.billing_email}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="co-phone">{t("company", "phoneLabel")}</Label>
                <Input
                  id="co-phone"
                  placeholder={t("company", "phonePlaceholder")}
                  {...bind("phone")}
                />
              </div>
            </div>
          </section>

          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("company", "savingBtn")}
              </>
            ) : (
              t("company", "saveBtn")
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
