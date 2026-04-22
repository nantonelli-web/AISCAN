import { Resend } from "resend";

let _client: Resend | null = null;

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY);
  return _client;
}

const FROM =
  process.env.EMAIL_FROM ?? "AISCAN <noreply@nimadigital.ae>";

// Logo served from the public production domain so email clients can
// load it without being logged into the app. Emails must use absolute URLs.
const LOGO_URL = "https://aiscan.biz/logo.webp";

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
<body style="margin:0;padding:0;background:#0a0a0a;color:#f5f5f5;font-family:-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${LOGO_URL}" alt="AISCAN" height="48" style="display:inline-block;height:48px;width:auto;border:0;outline:none;text-decoration:none;" />
    </div>

    <div style="background:#121212;border:1px solid #232323;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h1 style="margin:0 0 8px;font-size:20px;color:#f5f5f5;">
        ${data.adsCount} nuove ads rilevate
      </h1>
      <p style="margin:0;color:#b0b0b0;font-size:14px;">
        <strong style="color:#0e3590;">${esc(data.competitorName)}</strong> ha pubblicato nuove creatività.
      </p>
    </div>

    ${previewAds
      .map((ad) => {
        const imgUrl = ad.imageUrl && !ad.imageUrl.includes("/render_ad/") ? safeUrl(ad.imageUrl) : null;
        const truncated = ad.adText ? ad.adText.slice(0, 120) + (ad.adText.length > 120 ? "…" : "") : null;
        return `
    <div style="background:#121212;border:1px solid #232323;border-radius:12px;padding:16px;margin-bottom:12px;display:flex;gap:16px;">
      ${imgUrl && imgUrl !== "#" ? `<img src="${imgUrl}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;" />` : ""}
      <div>
        ${ad.headline ? `<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#f5f5f5;">${esc(ad.headline)}</p>` : ""}
        ${truncated ? `<p style="margin:0;font-size:12px;color:#b0b0b0;line-height:1.5;">${esc(truncated)}</p>` : ""}
        <a href="${safeUrl(ad.adLibraryUrl)}" style="display:inline-block;margin-top:8px;font-size:11px;color:#0e3590;text-decoration:none;">Vedi su Ad Library →</a>
      </div>
    </div>`;
      })
      .join("")}

    ${data.adsCount > 5 ? `<p style="text-align:center;color:#b0b0b0;font-size:12px;">+ altre ${data.adsCount - 5} ads</p>` : ""}

    <div style="text-align:center;margin-top:24px;">
      <a href="${safeUrl(data.dashboardUrl)}" style="display:inline-block;background:#0e3590;color:#ffffff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
        Apri Dashboard
      </a>
    </div>

    <p style="text-align:center;margin-top:32px;font-size:10px;color:#666;letter-spacing:0.1em;text-transform:uppercase;">
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
<body style="margin:0;padding:0;background:#0a0a0a;color:#f5f5f5;font-family:-apple-system,system-ui,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${LOGO_URL}" alt="AISCAN" height="48" style="display:inline-block;height:48px;width:auto;border:0;outline:none;text-decoration:none;" />
    </div>

    <div style="background:#121212;border:1px solid #232323;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h1 style="margin:0 0 4px;font-size:20px;color:#f5f5f5;">
        ${esc(data.workspaceName)}
      </h1>
      <p style="margin:0;color:#b0b0b0;font-size:13px;">
        ${esc(data.weekRange)} · ${data.totalNewAds} nuove ads rilevate
      </p>
    </div>

    <h2 style="font-size:13px;color:#0e3590;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 12px;">
      Attività competitor
    </h2>
    <div style="background:#121212;border:1px solid #232323;border-radius:12px;overflow:hidden;">
      ${data.competitors
        .map(
          (c, i) => `
      <div style="padding:12px 16px;${i > 0 ? "border-top:1px solid #232323;" : ""}display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:14px;font-weight:500;">${esc(c.name)}</span>
        <span style="font-size:12px;color:#b0b0b0;">
          <strong style="color:#0e3590;">+${c.newAds}</strong> nuove · ${c.totalActive} attive
        </span>
      </div>`
        )
        .join("")}
    </div>

    ${
      data.topAds.length > 0
        ? `
    <h2 style="font-size:13px;color:#0e3590;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 12px;">
      Top creatività della settimana
    </h2>
    ${data.topAds
      .slice(0, 3)
      .map(
        (ad) => `
    <div style="background:#121212;border:1px solid #232323;border-radius:12px;padding:16px;margin-bottom:12px;">
      <p style="margin:0 0 4px;font-size:11px;color:#0e3590;">${esc(ad.competitorName)}</p>
      ${ad.headline ? `<p style="margin:0;font-size:14px;font-weight:500;">${esc(ad.headline)}</p>` : ""}
      <a href="${safeUrl(ad.adLibraryUrl)}" style="font-size:11px;color:#0e3590;text-decoration:none;">Vedi su Ad Library →</a>
    </div>`
      )
      .join("")}`
        : ""
    }

    <div style="text-align:center;margin-top:24px;">
      <a href="${safeUrl(data.dashboardUrl)}" style="display:inline-block;background:#0e3590;color:#ffffff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
        Apri Dashboard
      </a>
    </div>

    <p style="text-align:center;margin-top:32px;font-size:10px;color:#666;letter-spacing:0.1em;text-transform:uppercase;">
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
