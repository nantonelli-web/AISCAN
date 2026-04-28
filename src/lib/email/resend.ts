import { Resend } from "resend";

let _client: Resend | null = null;

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY);
  return _client;
}

const FROM =
  process.env.EMAIL_FROM ?? "AISCAN <noreply@nimadigital.ae>";

// Logo served from the public production domain. Derive from the configured
// app URL so preview/staging environments serve their own copy, and prefer
// a .png over .webp because legacy email clients (Outlook in particular)
// still do not render WebP.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://aiscan.biz";
const LOGO_URL = `${APP_URL}/logo.webp`;

// Light, brand-consistent palette. Keep these as constants so every
// template stays in sync.
const EMAIL_BG = "#ffffff";
const CARD_BG = "#f9fafb";       // very light gray, above white
const CARD_BORDER = "#e5e7eb";
const TEXT_PRIMARY = "#0a0a0a";
const TEXT_MUTED = "#5b6472";
const BRAND = "#0e3590";          // navy — matches app
const BRAND_FG = "#ffffff";
const FOOTER_MUTED = "#9ca3af";

/** Escape user-controlled text before interpolating into email HTML. */
function esc(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Only accept absolute http(s) URLs; otherwise return "#" so hrefs are inert. */
function safeUrl(value: string | null | undefined): string {
  if (!value) return "#";
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "#";
    return u.toString();
  } catch {
    return "#";
  }
}

/** Strip CR/LF from subject lines to block header injection. */
function safeSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 255);
}

export interface NewAdsEmailData {
  competitorName: string;
  adsCount: number;
  ads: {
    headline: string | null;
    adText: string | null;
    imageUrl: string | null;
    adLibraryUrl: string;
  }[];
  dashboardUrl: string;
}

export async function sendNewAdsNotification(
  to: string[],
  data: NewAdsEmailData
) {
  const resend = getResend();
  if (!resend || to.length === 0) return;

  const previewAds = data.ads.slice(0, 5);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${EMAIL_BG};color:${TEXT_PRIMARY};font-family:-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${LOGO_URL}" alt="AISCAN" height="40" style="display:inline-block;height:40px;width:auto;border:0;outline:none;text-decoration:none;" />
    </div>

    <div style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:24px;margin-bottom:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:${TEXT_PRIMARY};">
        ${data.adsCount} nuove ads rilevate
      </h1>
      <p style="margin:0;color:${TEXT_MUTED};font-size:14px;">
        <strong style="color:${BRAND};">${esc(data.competitorName)}</strong> ha pubblicato nuove creatività.
      </p>
    </div>

    ${previewAds
      .map((ad) => {
        const imgUrl = ad.imageUrl && !ad.imageUrl.includes("/render_ad/") ? safeUrl(ad.imageUrl) : null;
        const truncated = ad.adText ? ad.adText.slice(0, 120) + (ad.adText.length > 120 ? "…" : "") : null;
        return `
    <div style="background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:12px;padding:16px;margin-bottom:12px;display:flex;gap:16px;">
      ${imgUrl && imgUrl !== "#" ? `<img src="${imgUrl}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;" />` : ""}
      <div>
        ${ad.headline ? `<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:${TEXT_PRIMARY};">${esc(ad.headline)}</p>` : ""}
        ${truncated ? `<p style="margin:0;font-size:12px;color:${TEXT_MUTED};line-height:1.5;">${esc(truncated)}</p>` : ""}
        <a href="${safeUrl(ad.adLibraryUrl)}" style="display:inline-block;margin-top:8px;font-size:11px;color:${BRAND};text-decoration:none;">Vedi su Ad Library →</a>
      </div>
    </div>`;
      })
      .join("")}

    ${data.adsCount > 5 ? `<p style="text-align:center;color:${TEXT_MUTED};font-size:12px;">+ altre ${data.adsCount - 5} ads</p>` : ""}

    <div style="text-align:center;margin-top:24px;">
      <a href="${safeUrl(data.dashboardUrl)}" style="display:inline-block;background:${BRAND};color:${BRAND_FG};font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
        Apri Dashboard
      </a>
    </div>

    <p style="text-align:center;margin-top:32px;font-size:10px;color:${FOOTER_MUTED};letter-spacing:0.1em;text-transform:uppercase;">
      NIMA Digital Consulting FZCO · Dubai
    </p>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: safeSubject(`${data.competitorName}: ${data.adsCount} nuove ads rilevate — AISCAN`),
    html,
  });
}

export interface WeeklyDigestData {
  workspaceName: string;
  weekRange: string;
  competitors: {
    name: string;
    newAds: number;
    totalActive: number;
  }[];
  totalNewAds: number;
  topAds: {
    competitorName: string;
    headline: string | null;
    imageUrl: string | null;
    adLibraryUrl: string;
  }[];
  dashboardUrl: string;
}

export async function sendWeeklyDigest(
  to: string[],
  data: WeeklyDigestData
) {
  const resend = getResend();
  if (!resend || to.length === 0) return;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${EMAIL_BG};color:${TEXT_PRIMARY};font-family:-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${LOGO_URL}" alt="AISCAN" height="40" style="display:inline-block;height:40px;width:auto;border:0;outline:none;text-decoration:none;" />
    </div>

    <div style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:24px;margin-bottom:24px;">
      <h1 style="margin:0 0 4px;font-size:20px;color:${TEXT_PRIMARY};">
        ${esc(data.workspaceName)}
      </h1>
      <p style="margin:0;color:${TEXT_MUTED};font-size:13px;">
        ${esc(data.weekRange)} · ${data.totalNewAds} nuove ads rilevate
      </p>
    </div>

    <h2 style="font-size:13px;color:${BRAND};text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 12px;">
      Attività competitor
    </h2>
    <div style="background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:12px;overflow:hidden;">
      ${data.competitors
        .map(
          (c, i) => `
      <div style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${CARD_BORDER};` : ""}display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:14px;font-weight:500;color:${TEXT_PRIMARY};">${esc(c.name)}</span>
        <span style="font-size:12px;color:${TEXT_MUTED};">
          <strong style="color:${BRAND};">+${c.newAds}</strong> nuove · ${c.totalActive} attive
        </span>
      </div>`
        )
        .join("")}
    </div>

    ${
      data.topAds.length > 0
        ? `
    <h2 style="font-size:13px;color:${BRAND};text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 12px;">
      Top creatività della settimana
    </h2>
    ${data.topAds
      .slice(0, 3)
      .map(
        (ad) => `
    <div style="background:#ffffff;border:1px solid ${CARD_BORDER};border-radius:12px;padding:16px;margin-bottom:12px;">
      <p style="margin:0 0 4px;font-size:11px;color:${BRAND};">${esc(ad.competitorName)}</p>
      ${ad.headline ? `<p style="margin:0;font-size:14px;font-weight:500;color:${TEXT_PRIMARY};">${esc(ad.headline)}</p>` : ""}
      <a href="${safeUrl(ad.adLibraryUrl)}" style="font-size:11px;color:${BRAND};text-decoration:none;">Vedi su Ad Library →</a>
    </div>`
      )
      .join("")}`
        : ""
    }

    <div style="text-align:center;margin-top:24px;">
      <a href="${safeUrl(data.dashboardUrl)}" style="display:inline-block;background:${BRAND};color:${BRAND_FG};font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
        Apri Dashboard
      </a>
    </div>

    <p style="text-align:center;margin-top:32px;font-size:10px;color:${FOOTER_MUTED};letter-spacing:0.1em;text-transform:uppercase;">
      NIMA Digital Consulting FZCO · Dubai
    </p>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: safeSubject(`Weekly Digest: ${data.totalNewAds} nuove ads — ${data.workspaceName}`),
    html,
  });
}

/* ── Credit recharge request ─────────────────────────────── */

export interface CreditRechargeEmailData {
  /** End-user details so the admin can identify who to contact. */
  userName: string;
  userEmail: string;
  /** Workspace name + id — useful when an admin manages many workspaces. */
  workspaceName: string;
  workspaceId: string;
  /** Pack details. Re-resolved server-side from `pricing.ts` to
   *  prevent a forged client payload from spoofing the price. */
  credits: number;
  priceEur: number;
  /** Direct link to the admin requests panel so the admin can
   *  fulfil with one click. */
  adminPanelUrl: string;
}

/**
 * Notify the AISCAN admin (defaults to aiscan@nimadigital.ae, can be
 * overridden via CREDITS_REQUEST_EMAIL env var) that a workspace has
 * requested a credit recharge. Mirrors the AICREA layout so the two
 * inboxes feel consistent.
 *
 * The email is fire-and-forget: failures are logged but do not block
 * the API response — the request row is already in the DB, so the
 * admin can also see it from the panel even if Resend is misbehaving.
 */
export async function sendCreditRechargeRequest(
  data: CreditRechargeEmailData,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.error(
      "[Resend] RESEND_API_KEY missing — credit recharge email NOT sent",
    );
    return;
  }

  const to = process.env.CREDITS_REQUEST_EMAIL ?? "aiscan@nimadigital.ae";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${EMAIL_BG};color:${TEXT_PRIMARY};font-family:-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${LOGO_URL}" alt="AISCAN" height="40" style="display:inline-block;height:40px;width:auto;border:0;outline:none;text-decoration:none;" />
    </div>

    <div style="background:${CARD_BG};border:1px solid ${CARD_BORDER};border-radius:12px;padding:24px;margin-bottom:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:${TEXT_PRIMARY};">
        Richiesta ricarica crediti
      </h1>
      <p style="margin:0;color:${TEXT_MUTED};font-size:14px;">
        Un workspace ha chiesto di acquistare un pack.
      </p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;color:${TEXT_MUTED};width:140px;">Cliente</td>
        <td style="padding:8px 0;font-weight:600;color:${TEXT_PRIMARY};">${esc(data.userName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${TEXT_MUTED};">Email</td>
        <td style="padding:8px 0;"><a href="mailto:${esc(data.userEmail)}" style="color:${BRAND};text-decoration:none;">${esc(data.userEmail)}</a></td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${TEXT_MUTED};">Workspace</td>
        <td style="padding:8px 0;font-weight:500;color:${TEXT_PRIMARY};">${esc(data.workspaceName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${TEXT_MUTED};">Crediti richiesti</td>
        <td style="padding:8px 0;font-weight:700;font-size:18px;color:${TEXT_PRIMARY};">${data.credits.toLocaleString("it-IT")}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${TEXT_MUTED};">Prezzo pack</td>
        <td style="padding:8px 0;font-weight:700;font-size:18px;color:${TEXT_PRIMARY};">€${data.priceEur.toFixed(2)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:${TEXT_MUTED};">Data</td>
        <td style="padding:8px 0;color:${TEXT_PRIMARY};">${new Date().toLocaleString("it-IT", { dateStyle: "long", timeStyle: "short" })}</td>
      </tr>
    </table>

    <p style="margin:0 0 16px;color:${TEXT_MUTED};font-size:13px;line-height:1.5;">
      Rispondi a questa email per contattare il cliente direttamente.
    </p>

    <div style="text-align:center;margin-top:24px;">
      <a href="${safeUrl(data.adminPanelUrl)}" style="display:inline-block;background:${BRAND};color:${BRAND_FG};font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
        Apri admin panel
      </a>
    </div>

    <p style="text-align:center;margin-top:32px;font-size:10px;color:${FOOTER_MUTED};letter-spacing:0.1em;text-transform:uppercase;">
      NIMA Digital Consulting FZCO · Dubai
    </p>
  </div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM,
      to: [to],
      replyTo: data.userEmail,
      subject: safeSubject(
        `[AISCAN] Richiesta ricarica - ${data.credits} crediti (€${data.priceEur})`,
      ),
      html,
    });
  } catch (e) {
    // Log only — the DB row is the source of truth, the admin will
    // see the request from the panel anyway.
    console.error("[Resend] sendCreditRechargeRequest failed:", e);
  }
}
