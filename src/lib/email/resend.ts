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
        <strong style="color:#2667ff;">${data.competitorName}</strong> ha pubblicato nuove creatività.
      </p>
    </div>

    ${previewAds
      .map(
        (ad) => `
    <div style="background:#121212;border:1px solid #232323;border-radius:12px;padding:16px;margin-bottom:12px;display:flex;gap:16px;">
      ${
        ad.imageUrl && !ad.imageUrl.includes("/render_ad/")
          ? `<img src="${ad.imageUrl}" alt="" style="width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
          : ""
      }
      <div>
        ${ad.headline ? `<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#f5f5f5;">${ad.headline}</p>` : ""}
        ${ad.adText ? `<p style="margin:0;font-size:12px;color:#b0b0b0;line-height:1.5;">${ad.adText.slice(0, 120)}${ad.adText.length > 120 ? "…" : ""}</p>` : ""}
        <a href="${ad.adLibraryUrl}" style="display:inline-block;margin-top:8px;font-size:11px;color:#2667ff;text-decoration:none;">Vedi su Ad Library →</a>
      </div>
    </div>`
      )
      .join("")}

    ${data.adsCount > 5 ? `<p style="text-align:center;color:#b0b0b0;font-size:12px;">+ altre ${data.adsCount - 5} ads</p>` : ""}

    <div style="text-align:center;margin-top:24px;">
      <a href="${data.dashboardUrl}" style="display:inline-block;background:#2667ff;color:#ffffff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
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
    subject: `${data.competitorName}: ${data.adsCount} nuove ads rilevate — AISCAN`,
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
        ${data.workspaceName}
      </h1>
      <p style="margin:0;color:#b0b0b0;font-size:13px;">
        ${data.weekRange} · ${data.totalNewAds} nuove ads rilevate
      </p>
    </div>

    <h2 style="font-size:13px;color:#2667ff;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 12px;">
      Attività competitor
    </h2>
    <div style="background:#121212;border:1px solid #232323;border-radius:12px;overflow:hidden;">
      ${data.competitors
        .map(
          (c, i) => `
      <div style="padding:12px 16px;${i > 0 ? "border-top:1px solid #232323;" : ""}display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:14px;font-weight:500;">${c.name}</span>
        <span style="font-size:12px;color:#b0b0b0;">
          <strong style="color:#2667ff;">+${c.newAds}</strong> nuove · ${c.totalActive} attive
        </span>
      </div>`
        )
        .join("")}
    </div>

    ${
      data.topAds.length > 0
        ? `
    <h2 style="font-size:13px;color:#2667ff;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 12px;">
      Top creatività della settimana
    </h2>
    ${data.topAds
      .slice(0, 3)
      .map(
        (ad) => `
    <div style="background:#121212;border:1px solid #232323;border-radius:12px;padding:16px;margin-bottom:12px;">
      <p style="margin:0 0 4px;font-size:11px;color:#2667ff;">${ad.competitorName}</p>
      ${ad.headline ? `<p style="margin:0;font-size:14px;font-weight:500;">${ad.headline}</p>` : ""}
      <a href="${ad.adLibraryUrl}" style="font-size:11px;color:#2667ff;text-decoration:none;">Vedi su Ad Library →</a>
    </div>`
      )
      .join("")}`
        : ""
    }

    <div style="text-align:center;margin-top:24px;">
      <a href="${data.dashboardUrl}" style="display:inline-block;background:#2667ff;color:#ffffff;font-size:14px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;">
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
    subject: `Weekly Digest: ${data.totalNewAds} nuove ads — ${data.workspaceName}`,
    html,
  });
}
