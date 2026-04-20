import PptxGenJS from "pptxgenjs";
import { type ThemeConfig, DEFAULT_THEME } from "./parse-template";
import type {
  CopywriterBrandAnalysis,
  CreativeDirectorBrandAnalysis,
  CreativeAnalysisResult,
} from "@/lib/ai/creative-analysis";

// ─── Types ───────────────────────────────────────────────────────

export interface BrandData {
  id: string;
  name: string;
  totalAds: number;
  activeAds: number;
  imageCount: number;
  videoCount: number;
  carouselCount: number;
  topCtas: { name: string; count: number }[];
  platforms: { name: string; count: number }[];
  avgDuration: number;
  avgCopyLength: number;
  adsPerWeek: number;
  /** % of ads eligible for / using Meta Advantage+ automatic optimization */
  advantagePlusPercent?: number;
  /** Average number of variants (collationCount) per ad */
  avgVariants?: number;
  lastScrapedAt: string | null;
  brandLogoBase64?: string | null;
  brandLogoMimeType?: string | null;
  objectiveInference: {
    objective: string;
    confidence: number;
    signals: string[];
  };
  latestAds: {
    headline: string | null;
    image_url: string | null;
    ad_archive_id: string;
    cta?: string | null;
    adText?: string | null;
    platforms?: string[] | null;
    status?: string | null;
    startDate?: string | null;
    imageBase64?: string | null;
    imageMimeType?: string | null;
  }[];
}

export type SectionType = "technical" | "copy" | "visual" | "benchmark";

type Locale = "it" | "en";

// ─── Helpers ─────────────────────────────────────────────────────

function hex(color: string): string {
  return color.replace("#", "");
}

function label(locale: Locale, it: string, en: string): string {
  return locale === "en" ? en : it;
}

function formatDate(locale: Locale): string {
  return new Date().toLocaleDateString(locale === "en" ? "en-GB" : "it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Lighten a hex color by mixing with white. factor 0-1, 0=same, 1=white */
function lighten(hexColor: string, factor: number): string {
  const h = hexColor.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const nr = Math.round(r + (255 - r) * factor);
  const ng = Math.round(g + (255 - g) * factor);
  const nb = Math.round(b + (255 - b) * factor);
  return [nr, ng, nb].map((c) => c.toString(16).padStart(2, "0")).join("");
}

/** Darken a hex color by mixing with black. factor 0-1, 0=same, 1=black */
function darken(hexColor: string, factor: number): string {
  const h = hexColor.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const nr = Math.round(r * (1 - factor));
  const ng = Math.round(g * (1 - factor));
  const nb = Math.round(b * (1 - factor));
  return [nr, ng, nb].map((c) => c.toString(16).padStart(2, "0")).join("");
}

// Slide dimensions: 10" x 5.63" (default widescreen)
const SW = 10;
const SH = 5.63;
const PAD = 0.3; // padding

/** Get the content slide background color, preferring template contentBackground over theme bg */
function contentBg(theme: ThemeConfig): string {
  return theme.contentBackground ?? theme.colors.background;
}

/** Add the template logo to a slide (top-right, small) — call on every slide */
function addLogo(slide: PptxGenJS.Slide, theme: ThemeConfig) {
  if (theme.logoBase64 && theme.logoMimeType) {
    slide.addImage({
      data: `data:${theme.logoMimeType};base64,${theme.logoBase64}`,
      x: SW - PAD - 0.4,  // top right
      y: 0.12,
      w: 0.38,
      h: 0.38,
      sizing: { type: "contain", w: 0.38, h: 0.38 },
    });
  }
}

/** Compute a readable date range from brand data (earliest lastScrapedAt to now) */
function computeDateRange(brands: BrandData[], locale: Locale): string {
  const now = new Date();
  // Use the earliest lastScrapedAt or fall back to 90 days ago
  const dates = brands.map((b) => b.lastScrapedAt ? new Date(b.lastScrapedAt).getTime() : 0).filter((d) => d > 0);
  const earliest = dates.length > 0 ? new Date(Math.min(...dates)) : new Date(now.getTime() - 90 * 86_400_000);
  // Go back 90 days from earliest scan for the data range
  const rangeStart = new Date(earliest.getTime() - 90 * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString(locale === "en" ? "en-GB" : "it-IT", { day: "2-digit", month: "short", year: "numeric" });
  return `${fmt(rangeStart)} – ${fmt(now)}`;
}

/** Generate a dynamic commentary comparing brands */
function generateOverviewComment(brands: BrandData[], locale: Locale): string {
  if (brands.length < 2) return "";
  const [a, b] = brands;
  const parts: string[] = [];
  // Volume
  if (a.totalAds > b.totalAds * 1.3) {
    parts.push(locale === "it"
      ? `${a.name} ha un volume ads significativamente superiore (${a.totalAds} vs ${b.totalAds}).`
      : `${a.name} has a significantly higher ad volume (${a.totalAds} vs ${b.totalAds}).`);
  } else if (b.totalAds > a.totalAds * 1.3) {
    parts.push(locale === "it"
      ? `${b.name} ha un volume ads significativamente superiore (${b.totalAds} vs ${a.totalAds}).`
      : `${b.name} has a significantly higher ad volume (${b.totalAds} vs ${a.totalAds}).`);
  }
  // Refresh rate
  if (a.adsPerWeek > 0 && b.adsPerWeek > 0) {
    const faster = a.adsPerWeek > b.adsPerWeek ? a : b;
    const ratio = Math.round((faster.adsPerWeek / Math.min(a.adsPerWeek, b.adsPerWeek)) * 10) / 10;
    if (ratio >= 1.5) {
      parts.push(locale === "it"
        ? `${faster.name} aggiorna i creativi ${ratio}x più velocemente.`
        : `${faster.name} refreshes creatives ${ratio}x faster.`);
    }
  }
  // Objectives
  if (a.objectiveInference.objective !== b.objectiveInference.objective && a.objectiveInference.objective !== "unknown" && b.objectiveInference.objective !== "unknown") {
    parts.push(locale === "it"
      ? `Obiettivi diversi: ${a.name} → ${a.objectiveInference.objective.replace(/_/g, " ")}, ${b.name} → ${b.objectiveInference.objective.replace(/_/g, " ")}.`
      : `Different objectives: ${a.name} → ${a.objectiveInference.objective.replace(/_/g, " ")}, ${b.name} → ${b.objectiveInference.objective.replace(/_/g, " ")}.`);
  }
  return parts.join(" ");
}

/** Generate a dynamic CTA commentary */
function generateCtaComment(brands: BrandData[], locale: Locale): string {
  if (brands.length < 2) return "";
  const parts: string[] = [];
  for (const b of brands) {
    const top = b.topCtas[0];
    if (top) {
      const pct = b.totalAds > 0 ? Math.round((top.count / b.totalAds) * 100) : 0;
      parts.push(`${b.name}: ${top.name} (${pct}%)`);
    }
  }
  if (parts.length < 2) return "";
  return locale === "it"
    ? `CTA dominante — ${parts.join(" vs ")}. ${brands[0].topCtas[0]?.name === brands[1].topCtas[0]?.name ? "Entrambi i brand privilegiano la stessa CTA." : "Strategie CTA differenti indicano obiettivi di campagna diversi."}`
    : `Dominant CTA — ${parts.join(" vs ")}. ${brands[0].topCtas[0]?.name === brands[1].topCtas[0]?.name ? "Both brands favor the same CTA." : "Different CTA strategies indicate different campaign objectives."}`;
}

/** Parse image dimensions from a base64-encoded JPEG or PNG buffer */
function getImageDimensions(base64: string): { w: number; h: number } | null {
  try {
    const buf = Buffer.from(base64, "base64");
    // PNG: bytes 16-23 contain width (4 bytes) and height (4 bytes) in IHDR
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      if (w > 0 && h > 0) return { w, h };
    }
    // JPEG: scan for SOF0/SOF2 marker (0xFF 0xC0 or 0xFF 0xC2)
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xc0 || marker === 0xc2) {
          const h = buf.readUInt16BE(i + 5);
          const w = buf.readUInt16BE(i + 7);
          if (w > 0 && h > 0) return { w, h };
        }
        const len = buf.readUInt16BE(i + 2);
        i += 2 + len;
      }
    }
    // WebP: RIFF header, VP8 chunk
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57 && buf[9] === 0x45) {
      // VP8 (lossy): width at offset 26, height at 28
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
        const w = buf.readUInt16LE(26) & 0x3fff;
        const h = buf.readUInt16LE(28) & 0x3fff;
        if (w > 0 && h > 0) return { w, h };
      }
    }
  } catch { /* ignore */ }
  return null;
}

/** Calculate image dimensions to fit within a container while maintaining aspect ratio */
function fitImage(
  imgW: number, imgH: number,
  containerW: number, containerH: number
): { x: number; y: number; w: number; h: number } {
  const imgRatio = imgW / imgH;
  const containerRatio = containerW / containerH;
  let w: number, h: number, x: number, y: number;
  if (imgRatio > containerRatio) {
    // Image is wider — fit to width
    w = containerW;
    h = containerW / imgRatio;
    x = 0;
    y = (containerH - h) / 2;
  } else {
    // Image is taller — fit to height
    h = containerH;
    w = containerH * imgRatio;
    x = (containerW - w) / 2;
    y = 0;
  }
  return { x, y, w, h };
}

/** Render an ad card: dark image box + headline + CTA badge */
function addAdCard(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  ad: BrandData["latestAds"][0],
  x: number,
  y: number,
  w: number,
  theme: ThemeConfig
) {
  const containerW = w - 0.08;
  const containerH = containerW * 1.2; // default 5:6 portrait ratio for container
  const cardH = containerH + 0.65;

  // Card background
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h: cardH,
    fill: { color: "1C1C1C" },
    line: { type: "none" }, rectRadius: 0.04,
  });

  // Dark image area
  slide.addShape(pptx.ShapeType.rect, {
    x: x + 0.04, y: y + 0.04, w: containerW, h: containerH,
    fill: { color: "111111" }, line: { type: "none" },
  });

  // Image — calculate real fit from actual dimensions
  if (ad.imageBase64 && ad.imageMimeType) {
    const dims = getImageDimensions(ad.imageBase64);
    if (dims) {
      const fit = fitImage(dims.w, dims.h, containerW, containerH);
      slide.addImage({
        data: `data:${ad.imageMimeType};base64,${ad.imageBase64}`,
        x: x + 0.04 + fit.x, y: y + 0.04 + fit.y, w: fit.w, h: fit.h,
      });
    } else {
      // Fallback: fill container (unknown dimensions)
      slide.addImage({
        data: `data:${ad.imageMimeType};base64,${ad.imageBase64}`,
        x: x + 0.04, y: y + 0.04, w: containerW, h: containerH,
      });
    }
  }

  // Headline (white on dark card)
  const headline = ad.headline?.slice(0, 45) || "Ad";
  slide.addText(headline, {
    x: x + 0.06, y: y + containerH + 0.08, w: w - 0.12, h: 0.22,
    fontSize: 6, fontFace: theme.fonts.body, color: "F5F5F5",
    valign: "top",
  });

  // CTA badge
  if (ad.cta) {
    const ctaW = Math.min(ad.cta.length * 0.05 + 0.1, w * 0.7);
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.06, y: y + containerH + 0.32, w: ctaW, h: 0.14,
      fill: { color: "D4A843" }, line: { type: "none" }, rectRadius: 0.02,
    });
    slide.addText(ad.cta, {
      x: x + 0.06, y: y + containerH + 0.32, w: ctaW, h: 0.14,
      fontSize: 5, fontFace: theme.fonts.body, color: "1C1C1C",
      bold: true, align: "center",
    });
  }

  // Platforms
  if (ad.platforms && ad.platforms.length > 0) {
    slide.addText(ad.platforms.slice(0, 3).join(" \u00B7 "), {
      x: x + 0.06, y: y + containerH + 0.48, w: w - 0.12, h: 0.12,
      fontSize: 4, fontFace: theme.fonts.body, color: "999999",
    });
  }

  return cardH;
}

/** Format a date according to locale (dd mmm yyyy) */
function formatAdDate(iso: string, locale: Locale): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "it-IT", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Render a detailed ad card (larger, more info) — mimics the dashboard detail view.
 * Shows: big image, ACTIVE badge, headline, ad body, CTA pill, platforms, start date.
 */
function addDetailedAdCard(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  ad: BrandData["latestAds"][0],
  x: number,
  y: number,
  w: number,
  h: number,
  theme: ThemeConfig,
  locale: Locale
) {
  // Card background
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: "1C1C1C" },
    line: { type: "none" }, rectRadius: 0.04,
  });

  // Image container (portrait-ish, slightly taller than wide)
  const imgPad = 0.05;
  const containerW = w - imgPad * 2;
  const containerH = containerW * 1.05;
  const imgX = x + imgPad;
  const imgY = y + imgPad;

  // Dark image backing
  slide.addShape(pptx.ShapeType.rect, {
    x: imgX, y: imgY, w: containerW, h: containerH,
    fill: { color: "0A0A0A" }, line: { type: "none" },
  });

  // Image — fit to real dimensions, preserve aspect
  if (ad.imageBase64 && ad.imageMimeType) {
    const dims = getImageDimensions(ad.imageBase64);
    if (dims) {
      const fit = fitImage(dims.w, dims.h, containerW, containerH);
      slide.addImage({
        data: `data:${ad.imageMimeType};base64,${ad.imageBase64}`,
        x: imgX + fit.x, y: imgY + fit.y, w: fit.w, h: fit.h,
      });
    } else {
      slide.addImage({
        data: `data:${ad.imageMimeType};base64,${ad.imageBase64}`,
        x: imgX, y: imgY, w: containerW, h: containerH,
      });
    }
  }

  // ACTIVE badge (top-right overlay)
  if (ad.status === "ACTIVE") {
    const badgeW = 0.5;
    const badgeH = 0.18;
    slide.addShape(pptx.ShapeType.rect, {
      x: x + w - badgeW - 0.08, y: y + 0.08, w: badgeW, h: badgeH,
      fill: { color: "10B981" }, line: { type: "none" }, rectRadius: 0.02,
    });
    slide.addText("ACTIVE", {
      x: x + w - badgeW - 0.08, y: y + 0.08, w: badgeW, h: badgeH,
      fontSize: 6, fontFace: theme.fonts.body, color: "FFFFFF",
      bold: true, align: "center", valign: "middle",
    });
  }

  // Text area
  const textX = x + 0.1;
  const textW = w - 0.2;
  let ty = imgY + containerH + 0.08;

  // Headline
  if (ad.headline) {
    slide.addText(ad.headline.slice(0, 90), {
      x: textX, y: ty, w: textW, h: 0.32,
      fontSize: 8.5, fontFace: theme.fonts.body, color: "F5F5F5",
      bold: true, valign: "top",
    });
    ty += 0.34;
  }

  // Ad body text
  if (ad.adText) {
    const body = ad.adText.length > 180 ? ad.adText.slice(0, 177) + "\u2026" : ad.adText;
    slide.addText(body, {
      x: textX, y: ty, w: textW, h: 0.5,
      fontSize: 6.5, fontFace: theme.fonts.body, color: "B5B5B5",
      valign: "top",
    });
    ty += 0.52;
  }

  // CTA pill
  if (ad.cta) {
    const ctaW = Math.min(ad.cta.length * 0.07 + 0.16, textW);
    slide.addShape(pptx.ShapeType.rect, {
      x: textX, y: ty, w: ctaW, h: 0.22,
      fill: { color: "D4A843" }, line: { type: "none" }, rectRadius: 0.03,
    });
    slide.addText(ad.cta, {
      x: textX, y: ty, w: ctaW, h: 0.22,
      fontSize: 7, fontFace: theme.fonts.body, color: "1C1C1C",
      bold: true, align: "center", valign: "middle",
    });
    ty += 0.27;
  }

  // Platforms
  if (ad.platforms && ad.platforms.length > 0) {
    slide.addText(ad.platforms.slice(0, 4).join(" \u00B7 "), {
      x: textX, y: ty, w: textW, h: 0.15,
      fontSize: 5.5, fontFace: theme.fonts.body, color: "888888",
    });
    ty += 0.16;
  }

  // Start date
  if (ad.startDate) {
    const dateStr = formatAdDate(ad.startDate, locale);
    if (dateStr) {
      slide.addText(`${label(locale, "Attiva dal", "Active since")} ${dateStr}`, {
        x: textX, y: ty, w: textW, h: 0.15,
        fontSize: 5.5, fontFace: theme.fonts.body, color: "777777",
      });
    }
  }
}

/**
 * Render a dedicated "Latest Ads" slide for a single brand.
 * Three large detailed cards that mirror the dashboard ad detail view.
 */
function latestAdsSlideForBrand(
  pptx: PptxGenJS,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(`${label(locale, "Ultime Ads", "Latest Ads")} \u2014 ${brand.name}`, {
    x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.4,
    fontSize: 14, fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary), bold: true,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: PAD, y: 0.55, w: SW - 2 * PAD, h: 0.03,
    fill: { color: hex(theme.colors.primary) }, line: { type: "none" },
  });

  const ads = brand.latestAds.slice(0, 3);
  if (ads.length === 0) {
    slide.addText(label(locale, "Nessuna ad recente", "No recent ads"), {
      x: PAD, y: 2.5, w: SW - 2 * PAD, h: 0.4,
      fontSize: 11, fontFace: theme.fonts.body,
      color: hex(theme.colors.text), transparency: 40,
    });
    return;
  }

  const startY = 0.68;
  const cardGap = 0.2;
  const cols = 3;
  const cardW = (SW - 2 * PAD - cardGap * (cols - 1)) / cols;
  const cardH = SH - startY - 0.15;

  ads.forEach((ad, i) => {
    const x = PAD + i * (cardW + cardGap);
    addDetailedAdCard(slide, pptx, ad, x, startY, cardW, cardH, theme, locale);
  });
}

// ─── Card background helper ─────────────────────────────────────

function addCardBg(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: hex(color) },
    rectRadius: 0.05,
    line: { type: "none" },
  });
}

// ─── SINGLE BRAND SLIDES ────────────────────────────────────────

function channelLabel(ch: string, locale: Locale): string {
  if (ch === "all") return locale === "it" ? "Tutti i canali" : "All channels";
  if (ch === "meta") return "Meta Ads";
  if (ch === "google") return "Google Ads";
  if (ch === "instagram") return "Instagram";
  return ch;
}

function singleCover(
  pptx: PptxGenJS,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale,
  channel: string = "meta"
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);

  // Cover: use template background image if available, otherwise flat color
  if (theme.coverImageBase64 && theme.coverImageMimeType) {
    slide.background = {
      data: `data:${theme.coverImageMimeType};base64,${theme.coverImageBase64}`,
    };
  } else {
    slide.background = { color: hex(contentBg(theme)) };
    // Accent bar only when no cover image
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: SW, h: 0.06,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
  }

  slide.addText(brand.name, {
    x: PAD,
    y: 1.8,
    w: SW - 2 * PAD,
    h: 1.0,
    fontSize: 36,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  slide.addText(
    label(locale, "Report Analisi Ads", "Ads Analysis Report"),
    {
      x: PAD,
      y: 2.8,
      w: SW - 2 * PAD,
      h: 0.5,
      fontSize: 16,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
    }
  );

  slide.addText(`${channelLabel(channel, locale)} \u00B7 ${formatDate(locale)}`, {
    x: PAD,
    y: 3.3,
    w: SW - 2 * PAD,
    h: 0.35,
    fontSize: 11,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
    transparency: 40,
  });

  if (brand.lastScrapedAt) {
    slide.addText(
      label(locale, "Dati scansione:", "Scan data:") + " " +
      new Date(brand.lastScrapedAt).toLocaleDateString(locale === "it" ? "it-IT" : "en-GB", { day: "numeric", month: "short", year: "numeric" }),
      {
        x: PAD,
        y: 3.65,
        w: SW - 2 * PAD,
        h: 0.3,
        fontSize: 9,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        transparency: 50,
      }
    );
  }

  slide.addText("Powered by AISCAN", {
    x: PAD,
    y: SH - 0.5,
    w: SW - 2 * PAD,
    h: 0.3,
    fontSize: 8,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.primary),
    transparency: 50,
  });
}

function singleDashboard(
  pptx: PptxGenJS,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  // Title
  slide.addText(label(locale, "Dashboard", "Dashboard"), {
    x: PAD,
    y: 0.15,
    w: SW - 2 * PAD,
    h: 0.4,
    fontSize: 14,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  // Top stats row: 4 cards
  const total = brand.imageCount + brand.videoCount + brand.carouselCount;
  const imgPct = total > 0 ? Math.round((brand.imageCount / total) * 100) : 0;
  const vidPct = total > 0 ? Math.round((brand.videoCount / total) * 100) : 0;
  const carPct = total > 0 ? Math.round((brand.carouselCount / total) * 100) : 0;

  const cardBg = lighten(contentBg(theme), 0.12);
  const statCards = [
    { lbl: label(locale, "Ads totali", "Total ads"), val: String(brand.totalAds) },
    { lbl: label(locale, "Ads attive", "Active ads"), val: String(brand.activeAds) },
    { lbl: label(locale, "Durata media", "Avg. duration"), val: brand.avgDuration > 0 ? `${brand.avgDuration} ${label(locale, "gg", "d")}` : "\u2014" },
    { lbl: label(locale, "Refresh rate", "Refresh rate"), val: brand.adsPerWeek > 0 ? `${brand.adsPerWeek} ${label(locale, "ads/sett.", "ads/wk")}` : "\u2014" },
  ];

  const cardW = (SW - 2 * PAD - 0.15 * 3) / 4;
  statCards.forEach((c, i) => {
    const x = PAD + i * (cardW + 0.15);
    const y = 0.65;
    addCardBg(slide, pptx, x, y, cardW, 0.7, cardBg);
    slide.addText(c.lbl, { x: x + 0.1, y: y + 0.05, w: cardW - 0.2, h: 0.25, fontSize: 7, fontFace: theme.fonts.body, color: hex(theme.colors.text), transparency: 40 });
    slide.addText(c.val, { x: x + 0.1, y: y + 0.28, w: cardW - 0.2, h: 0.35, fontSize: 18, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true });
  });

  // Second row: copy length + format mix
  const row2y = 1.55;
  // Copy length card
  addCardBg(slide, pptx, PAD, row2y, cardW * 2 + 0.15, 0.6, cardBg);
  slide.addText(label(locale, "Lunghezza media copy", "Avg. copy length"), { x: PAD + 0.1, y: row2y + 0.05, w: cardW * 2 - 0.1, h: 0.2, fontSize: 7, fontFace: theme.fonts.body, color: hex(theme.colors.text), transparency: 40 });
  slide.addText(brand.avgCopyLength > 0 ? `${brand.avgCopyLength} ${label(locale, "caratteri", "chars")}` : "\u2014", { x: PAD + 0.1, y: row2y + 0.25, w: cardW * 2 - 0.1, h: 0.3, fontSize: 16, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true });

  // Format mix card
  const fmx = PAD + cardW * 2 + 0.3;
  addCardBg(slide, pptx, fmx, row2y, cardW * 2 + 0.15, 0.6, cardBg);
  slide.addText(label(locale, "Format mix", "Format mix"), { x: fmx + 0.1, y: row2y + 0.05, w: cardW * 2 - 0.1, h: 0.2, fontSize: 7, fontFace: theme.fonts.body, color: hex(theme.colors.text), transparency: 40 });
  slide.addText(`${imgPct}% Img  |  ${vidPct}% Vid  |  ${carPct}% Car`, { x: fmx + 0.1, y: row2y + 0.25, w: cardW * 2 - 0.1, h: 0.3, fontSize: 12, fontFace: theme.fonts.body, color: hex(theme.colors.text) });

  // Bottom section: LEFT = Top CTAs bar chart, RIGHT = Platform pie
  const leftW = (SW - 2 * PAD) * 0.55;
  const rightW = (SW - 2 * PAD) * 0.4;
  const rightX = PAD + leftW + (SW - 2 * PAD) * 0.05;
  const botY = 2.35;
  const botH = SH - botY - 0.15;

  // CTA bar chart
  slide.addText(label(locale, "Top CTA", "Top CTAs"), { x: PAD, y: botY, w: leftW, h: 0.25, fontSize: 9, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true });

  const ctas = brand.topCtas.slice(0, 6);
  if (ctas.length > 0) {
    slide.addChart(pptx.ChartType.bar, [
      { name: "CTA", labels: ctas.map((c) => c.name), values: ctas.map((c) => c.count) },
    ], {
      x: PAD,
      y: botY + 0.3,
      w: leftW,
      h: botH - 0.35,
      barDir: "bar",
      showLegend: false,
      catAxisLabelColor: hex(theme.colors.text),
      catAxisLabelFontSize: 11,
      valAxisLabelColor: hex(theme.colors.text),
      valAxisLabelFontSize: 10,
      chartColors: [hex(theme.colors.primary)],
    });
  }

  // Platform pie chart
  slide.addText(label(locale, "Piattaforme", "Platforms"), { x: rightX, y: botY, w: rightW, h: 0.25, fontSize: 9, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true });

  const plats = brand.platforms;
  if (plats.length > 0) {
    const palette = [
      hex(theme.colors.primary),
      hex(theme.colors.secondary),
      hex(theme.colors.accent),
      "8a6bb0",
      "5ba09b",
      "a06b5b",
    ];
    slide.addChart(pptx.ChartType.doughnut, [
      { name: label(locale, "Piattaforme", "Platforms"), labels: plats.map((p) => p.name), values: plats.map((p) => p.count) },
    ], {
      x: rightX,
      y: botY + 0.3,
      w: rightW,
      h: botH - 0.35,
      showLegend: true,
      legendPos: "b",
      legendFontSize: 11,
      legendColor: hex(theme.colors.text),
      showPercent: true,
      dataLabelFontSize: 11,
      dataLabelColor: hex(theme.colors.text),
      chartColors: palette.slice(0, plats.length),
    });
  }
}

function singleObjectiveAndFormat(
  pptx: PptxGenJS,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  // Title
  slide.addText(label(locale, "Obiettivo & Formati", "Objective & Formats"), {
    x: PAD,
    y: 0.15,
    w: SW - 2 * PAD,
    h: 0.4,
    fontSize: 14,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  const obj = brand.objectiveInference;
  const leftW = (SW - 2 * PAD) * 0.55;
  const rightW = (SW - 2 * PAD) * 0.4;
  const rightX = PAD + leftW + (SW - 2 * PAD) * 0.05;
  const cardBg = lighten(contentBg(theme), 0.12);

  // LEFT: Objective
  addCardBg(slide, pptx, PAD, 0.7, leftW, 4.6, cardBg);

  slide.addText(label(locale, "Obiettivo campagna (stimato)", "Campaign objective (estimated)"), {
    x: PAD + 0.15,
    y: 0.8,
    w: leftW - 0.3,
    h: 0.25,
    fontSize: 9,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
    transparency: 40,
  });

  slide.addText(obj.objective.replace(/_/g, " ").toUpperCase(), {
    x: PAD + 0.15,
    y: 1.15,
    w: leftW - 0.3,
    h: 0.35,
    fontSize: 16,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  // Confidence bar
  slide.addShape(pptx.ShapeType.rect, {
    x: PAD + 0.15,
    y: 1.6,
    w: leftW - 0.6,
    h: 0.18,
    fill: { color: "333333" },
    line: { type: "none" },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: PAD + 0.15,
    y: 1.6,
    w: Math.max((leftW - 0.6) * (obj.confidence / 100), 0.02),
    h: 0.18,
    fill: { color: hex(theme.colors.primary) },
    line: { type: "none" },
  });
  slide.addText(`${obj.confidence}%`, {
    x: PAD + leftW - 0.6,
    y: 1.55,
    w: 0.4,
    h: 0.25,
    fontSize: 9,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
  });

  // Signals
  slide.addText(label(locale, "Segnali", "Signals"), {
    x: PAD + 0.15,
    y: 1.95,
    w: leftW - 0.3,
    h: 0.2,
    fontSize: 8,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  const signals = obj.signals.slice(0, 8);
  signals.forEach((s, i) => {
    slide.addText(`\u2022 ${s}`, {
      x: PAD + 0.2,
      y: 2.2 + i * 0.28,
      w: leftW - 0.4,
      h: 0.25,
      fontSize: 7,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      transparency: 20,
    });
  });

  // RIGHT: Format pie chart
  addCardBg(slide, pptx, rightX, 0.7, rightW, 4.6, cardBg);

  slide.addText(label(locale, "Distribuzione formati", "Format distribution"), {
    x: rightX + 0.1,
    y: 0.8,
    w: rightW - 0.2,
    h: 0.25,
    fontSize: 9,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  slide.addChart(pptx.ChartType.pie, [
    {
      name: label(locale, "Formati", "Formats"),
      labels: ["Image", "Video", "Carousel"],
      values: [brand.imageCount, brand.videoCount, brand.carouselCount],
    },
  ], {
    x: rightX + 0.1,
    y: 1.2,
    w: rightW - 0.2,
    h: 3.8,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 11,
    legendColor: hex(theme.colors.text),
    showPercent: true,
    dataLabelFontSize: 11,
    dataLabelColor: hex(theme.colors.text),
    chartColors: [
      hex(theme.colors.primary),
      hex(theme.colors.secondary),
      hex(theme.colors.accent),
    ],
  });
}

// ─── AI ANALYSIS SLIDES (shared for single and comparison) ──────
// Full text, no truncation. One slide per brand + comparison slide.

function full(text: string | null | undefined): string {
  return text?.trim() || "—";
}

function estimateLines(text: string, fontSize: number, widthInches: number): number {
  const charsPerLine = Math.floor(widthInches * 14 * (10 / fontSize));
  return Math.max(1, Math.ceil(text.length / Math.max(charsPerLine, 1)));
}

function addAnalysisCards(
  slide: PptxGenJS.Slide,
  pptx: PptxGenJS,
  fields: [string, string][],
  theme: ThemeConfig,
  startY: number
) {
  const cardBg = lighten(contentBg(theme), 0.08);
  const contentW = SW - 2 * PAD;
  // Two-column layout for better space usage
  const colW = (contentW - 0.15) / 2;
  let col = 0;
  let fy = startY;
  let maxColH = 0;

  for (const [lbl, val] of fields) {
    const lines = estimateLines(val, 7.5, colW - 0.2);
    const valH = Math.max(0.25, lines * 0.14);
    const cardH = valH + 0.28;
    const cx = col === 0 ? PAD : PAD + colW + 0.15;

    addCardBg(slide, pptx, cx, fy, colW, cardH, cardBg);

    // Label with gold accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: cx, y: fy, w: 0.04, h: cardH,
      fill: { color: hex(theme.colors.primary) }, line: { type: "none" },
    });
    slide.addText(lbl, {
      x: cx + 0.12, y: fy + 0.04, w: colW - 0.2, h: 0.18,
      fontSize: 7.5, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    slide.addText(val, {
      x: cx + 0.12, y: fy + 0.22, w: colW - 0.2, h: valH,
      fontSize: 7, fontFace: theme.fonts.body, color: hex(theme.colors.text), valign: "top",
    });

    if (cardH > maxColH) maxColH = cardH;

    if (col === 0) {
      col = 1;
    } else {
      col = 0;
      fy += maxColH + 0.1;
      maxColH = 0;
    }
  }
}

function addComparisonSlide(
  pptx: PptxGenJS,
  title: string,
  text: string,
  theme: ThemeConfig,
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(title, {
    x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
    fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
  });

  // Gold accent line
  slide.addShape(pptx.ShapeType.rect, {
    x: PAD, y: 0.55, w: SW - 2 * PAD, h: 0.03,
    fill: { color: hex(theme.colors.primary) }, line: { type: "none" },
  });

  // Full-width text card
  const cardBg = lighten(contentBg(theme), 0.06);
  addCardBg(slide, pptx, PAD, 0.7, SW - 2 * PAD, SH - 1.0, cardBg);

  // Split text into paragraphs for better readability
  const paragraphs = full(text).split(/\.\s+/).filter((p) => p.trim().length > 0);
  const formatted = paragraphs.map((p) => p.trim().endsWith(".") ? p.trim() : p.trim() + ".").join("\n\n");

  slide.addText(formatted, {
    x: PAD + 0.2, y: 0.8, w: SW - 2 * PAD - 0.4, h: SH - 1.1,
    fontSize: 8, fontFace: theme.fonts.body, color: hex(theme.colors.text), valign: "top",
    lineSpacingMultiple: 1.3,
  });
}

function addCopyAnalysisSlide(
  pptx: PptxGenJS,
  analyses: CopywriterBrandAnalysis[],
  comparison: string,
  theme: ThemeConfig,
  locale: Locale,
  brands?: BrandData[]
) {
  for (const a of analyses) {
    const slide = pptx.addSlide();
    addLogo(slide, theme);
    slide.background = { color: hex(contentBg(theme)) };

    slide.addText(`${label(locale, "Analisi Copy", "Copy Analysis")} \u2014 ${a.brandName}`, {
      x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
      fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });

    // Get example ad texts for this brand
    const brandData = brands?.find((b) => b.name === a.brandName);
    const examples = (brandData?.latestAds ?? [])
      .filter((ad) => ad.adText && ad.adText.length > 20)
      .slice(0, 2)
      .map((ad) => `\u201C${ad.adText!.slice(0, 100)}${ad.adText!.length > 100 ? "\u2026" : ""}\u201D`);
    const examplesText = examples.length > 0
      ? `\n${label(locale, "Esempi", "Examples")}: ${examples.join(" | ")}`
      : "";

    const fields: [string, string][] = [
      [label(locale, "Tono di voce", "Tone of voice"), full(a.toneOfVoice)],
      [label(locale, "Stile copy", "Copy style"), full(a.copyStyle) + examplesText],
      [label(locale, "Trigger emozionali", "Emotional triggers"), a.emotionalTriggers?.join(", ") ?? "\u2014"],
      [label(locale, "Pattern CTA", "CTA patterns"), full(a.ctaPatterns)],
      [label(locale, "Punti di forza", "Strengths"), full(a.strengths)],
      [label(locale, "Punti deboli", "Weaknesses"), full(a.weaknesses)],
    ];

    addAnalysisCards(slide, pptx, fields, theme, 0.6);
  }

  if (comparison && brands) {
    // Copy comparison with ad examples
    const slide = pptx.addSlide();
    addLogo(slide, theme);
    slide.background = { color: hex(contentBg(theme)) };

    slide.addText(label(locale, "Confronto Copy", "Copy Comparison"), {
      x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
      fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: PAD, y: 0.55, w: SW - 2 * PAD, h: 0.03,
      fill: { color: hex(theme.colors.primary) }, line: { type: "none" },
    });

    // Left: ad card examples
    const imgColW = (SW - 2 * PAD) * 0.35;
    const textColW = (SW - 2 * PAD) * 0.6;
    const textX = PAD + imgColW + (SW - 2 * PAD) * 0.05;
    const adCardW = (imgColW - 0.1) / brands.length;

    brands.forEach((b, bi) => {
      const bx = PAD + bi * (adCardW + 0.1);
      slide.addText(b.name, {
        x: bx, y: 0.65, w: adCardW, h: 0.2,
        fontSize: 6, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true, align: "center",
      });
      const ads = b.latestAds.filter((a) => a.imageBase64).slice(0, 2);
      ads.forEach((ad, j) => {
        addAdCard(slide, pptx, ad, bx, 0.88 + j * 2.0, adCardW, theme);
      });
    });

    // Right: comparison text
    const cardBg = lighten(contentBg(theme), 0.06);
    addCardBg(slide, pptx, textX, 0.65, textColW, SH - 0.95, cardBg);
    const paragraphs = full(comparison).split(/\.\s+/).filter((p) => p.trim().length > 0);
    const formatted = paragraphs.map((p) => p.trim().endsWith(".") ? p.trim() : p.trim() + ".").join("\n\n");
    slide.addText(formatted, {
      x: textX + 0.15, y: 0.75, w: textColW - 0.3, h: SH - 1.1,
      fontSize: 7.5, fontFace: theme.fonts.body, color: hex(theme.colors.text), valign: "top",
      lineSpacingMultiple: 1.3,
    });
  } else if (comparison) {
    addComparisonSlide(pptx, label(locale, "Confronto Copy", "Copy Comparison"), comparison, theme);
  }
}

function addVisualAnalysisSlide(
  pptx: PptxGenJS,
  analyses: CreativeDirectorBrandAnalysis[],
  comparison: string,
  theme: ThemeConfig,
  locale: Locale,
  brands?: BrandData[]
) {
  for (const a of analyses) {
    const slide = pptx.addSlide();
    addLogo(slide, theme);
    slide.background = { color: hex(contentBg(theme)) };

    slide.addText(`${label(locale, "Analisi Creativa", "Creative Analysis")} \u2014 ${a.brandName}`, {
      x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
      fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });

    const fields: [string, string][] = [
      [label(locale, "Stile visivo", "Visual style"), full(a.visualStyle)],
      [label(locale, "Palette colori", "Color palette"), full(a.colorPalette)],
      [label(locale, "Stile fotografico", "Photography style"), full(a.photographyStyle)],
      [label(locale, "Coerenza brand", "Brand consistency"), full(a.brandConsistency)],
      [label(locale, "Preferenze formato", "Format preferences"), full(a.formatPreferences)],
      [label(locale, "Punti di forza", "Strengths"), full(a.strengths)],
      [label(locale, "Punti deboli", "Weaknesses"), full(a.weaknesses)],
    ];

    addAnalysisCards(slide, pptx, fields, theme, 0.6);
  }

  if (comparison) {
    // Visual comparison slide with side-by-side columns + ad images
    const slide = pptx.addSlide();
    addLogo(slide, theme);
    slide.background = { color: hex(contentBg(theme)) };

    slide.addText(label(locale, "Confronto Creativo", "Creative Comparison"), {
      x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
      fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: PAD, y: 0.55, w: SW - 2 * PAD, h: 0.03,
      fill: { color: hex(theme.colors.primary) }, line: { type: "none" },
    });

    if (brands && brands.length >= 2) {
      // Left: one ad card per brand, Right: comparison text
      const imgColW = (SW - 2 * PAD) * 0.35;
      const textColW = (SW - 2 * PAD) * 0.6;
      const textX = PAD + imgColW + (SW - 2 * PAD) * 0.05;
      const adCardW = (imgColW - 0.1) / brands.length;

      brands.forEach((b, bi) => {
        const bx = PAD + bi * (adCardW + 0.1);
        slide.addText(b.name, {
          x: bx, y: 0.65, w: adCardW, h: 0.2,
          fontSize: 6, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true, align: "center",
        });
        // Show 2 ad cards per brand, stacked vertically
        const ads = b.latestAds.filter((a) => a.imageBase64).slice(0, 2);
        ads.forEach((ad, j) => {
          addAdCard(slide, pptx, ad, bx, 0.9 + j * 2.0, adCardW, theme);
        });
      });

      // Comparison text on the right
      const cardBg = lighten(contentBg(theme), 0.06);
      addCardBg(slide, pptx, textX, 0.65, textColW, SH - 0.95, cardBg);
      const paragraphs = full(comparison).split(/\.\s+/).filter((p) => p.trim().length > 0);
      const formatted = paragraphs.map((p) => p.trim().endsWith(".") ? p.trim() : p.trim() + ".").join("\n\n");
      slide.addText(formatted, {
        x: textX + 0.15, y: 0.75, w: textColW - 0.3, h: SH - 1.1,
        fontSize: 7.5, fontFace: theme.fonts.body, color: hex(theme.colors.text), valign: "top",
        lineSpacingMultiple: 1.3,
      });
    } else {
      // Fallback: just text
      addComparisonSlide(pptx, label(locale, "Confronto Creativo", "Creative Comparison"), comparison, theme);
    }
  }
}

// ─── COMPARISON SLIDES ──────────────────────────────────────────

function compCover(
  pptx: PptxGenJS,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale,
  channel: string = "meta"
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);

  // Cover: use template background image if available, otherwise flat color
  if (theme.coverImageBase64 && theme.coverImageMimeType) {
    slide.background = {
      data: `data:${theme.coverImageMimeType};base64,${theme.coverImageBase64}`,
    };
  } else {
    slide.background = { color: hex(contentBg(theme)) };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: SW, h: 0.06,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
  }

  // Brand logos row
  const logoSize = 0.6;
  const logoGap = 0.2;
  const totalLogosW = brands.length * logoSize + (brands.length - 1) * logoGap;
  brands.forEach((b, i) => {
    const lx = PAD + i * (logoSize + logoGap);
    if (b.brandLogoBase64 && b.brandLogoMimeType) {
      slide.addImage({
        data: `data:${b.brandLogoMimeType};base64,${b.brandLogoBase64}`,
        x: lx, y: 0.8, w: logoSize, h: logoSize,
        sizing: { type: "contain", w: logoSize, h: logoSize },
        rounding: true,
      });
    } else {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: lx, y: 0.8, w: logoSize, h: logoSize,
        fill: { color: lighten(hex(theme.colors.primary), 0.8) },
        line: { type: "none" },
      });
      slide.addText(b.name.charAt(0).toUpperCase(), {
        x: lx, y: 0.8, w: logoSize, h: logoSize,
        fontSize: 18, fontFace: theme.fonts.heading,
        color: hex(theme.colors.primary), bold: true, align: "center", valign: "middle",
      });
    }
  });

  slide.addText(brands.map((b) => b.name).join(" vs "), {
    x: PAD,
    y: 1.55,
    w: SW - 2 * PAD,
    h: 0.8,
    fontSize: 28,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  slide.addText(
    label(locale, "Report Confronto", "Comparison Report"),
    {
      x: PAD,
      y: 2.35,
      w: SW - 2 * PAD,
      h: 0.4,
      fontSize: 16,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
    }
  );

  // Channel + date range + production date
  const dateRange = computeDateRange(brands, locale);
  slide.addText(`${channelLabel(channel, locale)} \u00B7 ${dateRange}`, {
    x: PAD,
    y: 2.95,
    w: SW - 2 * PAD,
    h: 0.3,
    fontSize: 11,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
    transparency: 30,
  });

  slide.addText(label(locale, `Report generato il ${formatDate(locale)}`, `Report generated on ${formatDate(locale)}`), {
    x: PAD,
    y: 3.3,
    w: SW - 2 * PAD,
    h: 0.25,
    fontSize: 9,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
    transparency: 50,
  });

  slide.addText("Powered by AISCAN", {
    x: PAD,
    y: SH - 0.5,
    w: SW - 2 * PAD,
    h: 0.3,
    fontSize: 8,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.primary),
    transparency: 50,
  });
}

function compOverviewDashboard(
  pptx: PptxGenJS,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(label(locale, "Panoramica Comparativa", "Comparative Overview"), {
    x: PAD,
    y: 0.15,
    w: SW - 2 * PAD,
    h: 0.3,
    fontSize: 14,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  // Date range subtitle
  slide.addText(computeDateRange(brands, locale), {
    x: PAD,
    y: 0.42,
    w: SW - 2 * PAD,
    h: 0.2,
    fontSize: 8,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
    transparency: 40,
  });

  // Full-width comparison table
  const headerRow: PptxGenJS.TableRow = [
    {
      text: "",
      options: {
        fontSize: 8,
        fontFace: theme.fonts.heading,
        color: hex(theme.colors.text),
        fill: { color: hex(theme.colors.primary) },
        bold: true,
      },
    },
    ...brands.map((b) => ({
      text: b.name,
      options: {
        fontSize: 8,
        fontFace: theme.fonts.heading,
        color: hex(theme.colors.background),
        fill: { color: hex(theme.colors.primary) },
        bold: true,
        align: "center" as const,
      },
    })),
  ];

  const total = (b: BrandData) => b.imageCount + b.videoCount + b.carouselCount;
  const fmtMix = (b: BrandData) => {
    const t = total(b);
    if (t === 0) return "\u2014";
    return `${Math.round((b.imageCount / t) * 100)}% Img \u00B7 ${Math.round((b.videoCount / t) * 100)}% Vid \u00B7 ${Math.round((b.carouselCount / t) * 100)}% Car`;
  };

  const metrics: [string, (b: BrandData) => string][] = [
    [label(locale, "Ads totali", "Total ads"), (b) => String(b.totalAds)],
    [label(locale, "Ads attive", "Active ads"), (b) => String(b.activeAds)],
    [label(locale, "Durata media", "Avg. duration"), (b) => b.avgDuration > 0 ? `${b.avgDuration} ${label(locale, "gg", "d")}` : "\u2014"],
    [label(locale, "Lungh. copy", "Copy length"), (b) => b.avgCopyLength > 0 ? `${b.avgCopyLength} ${label(locale, "chr", "chr")}` : "\u2014"],
    [label(locale, "Refresh rate", "Refresh rate"), (b) => b.adsPerWeek > 0 ? `${b.adsPerWeek} ads/${label(locale, "sett", "wk")}` : "\u2014"],
    [label(locale, "Format mix", "Format mix"), fmtMix],
    [label(locale, "Top CTA", "Top CTA"), (b) => b.topCtas.slice(0, 2).map((c) => c.name).join(", ") || "\u2014"],
    [label(locale, "Piattaforme", "Platforms"), (b) => b.platforms.slice(0, 3).map((p) => p.name).join(", ") || "\u2014"],
    [label(locale, "Obiettivo stimato", "Est. objective"), (b) => b.objectiveInference.objective !== "unknown" ? `${b.objectiveInference.objective.replace(/_/g, " ")} (${b.objectiveInference.confidence}%)` : "\u2014"],
  ];

  const altBg = lighten(contentBg(theme), 0.08);

  const dataRows: PptxGenJS.TableRow[] = metrics.map(([lbl, fn], idx) => [
    {
      text: lbl,
      options: {
        fontSize: 8,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        fill: { color: idx % 2 === 0 ? hex(theme.colors.background) : altBg },
        bold: true,
        margin: [2, 6, 2, 6] as [number, number, number, number],
      },
    },
    ...brands.map((b) => ({
      text: fn(b),
      options: {
        fontSize: 8,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.primary),
        fill: { color: idx % 2 === 0 ? hex(theme.colors.background) : altBg },
        align: "center" as const,
        bold: true,
        margin: [2, 6, 2, 6] as [number, number, number, number],
      },
    })),
  ]);

  const labelColW = 2.2;
  const dataColW = (SW - 2 * PAD - labelColW) / brands.length;
  const colWidths = [labelColW, ...brands.map(() => dataColW)];

  slide.addTable([headerRow, ...dataRows], {
    x: PAD,
    y: 0.65,
    w: SW - 2 * PAD,
    colW: colWidths,
    rowH: 0.33,
    border: { type: "solid", pt: 0.5, color: "D0D0D0" },
  });

  // Dynamic commentary
  const comment = generateOverviewComment(brands, locale);
  if (comment) {
    const tableEndY = 0.65 + 0.33 * (metrics.length + 1) + 0.15;
    addCardBg(slide, pptx, PAD, tableEndY, SW - 2 * PAD, 0.55, lighten(contentBg(theme), 0.06));
    slide.addText(comment, {
      x: PAD + 0.15,
      y: tableEndY + 0.08,
      w: SW - 2 * PAD - 0.3,
      h: 0.4,
      fontSize: 7.5,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      italic: true,
      valign: "top",
    });
  }
}

function compObjectivesAndFormat(
  pptx: PptxGenJS,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(label(locale, "Obiettivi & Formati", "Objectives & Formats"), {
    x: PAD,
    y: 0.15,
    w: SW - 2 * PAD,
    h: 0.35,
    fontSize: 14,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  const cardBg = lighten(contentBg(theme), 0.12);

  // TOP HALF: Objectives side by side — show ALL signals + disclaimer
  const maxSignals = Math.max(...brands.map((b) => b.objectiveInference.signals.length));
  const sigLineH = 0.18;
  const topH = 1.15 + maxSignals * sigLineH + 0.2;
  const colW = (SW - 2 * PAD - 0.15 * (brands.length - 1)) / brands.length;

  brands.forEach((b, i) => {
    const x = PAD + i * (colW + 0.15);
    const y = 0.6;
    const obj = b.objectiveInference;

    addCardBg(slide, pptx, x, y, colW, topH, cardBg);

    // Brand name header bar
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: colW,
      h: 0.25,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
    slide.addText(b.name, {
      x: x + 0.08,
      y,
      w: colW - 0.16,
      h: 0.25,
      fontSize: 8,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.background),
      bold: true,
    });

    // Objective label — formatted as "Obiettivo: SALES"
    slide.addText(label(locale, "Obiettivo:", "Objective:"), {
      x: x + 0.08,
      y: y + 0.32,
      w: colW * 0.4,
      h: 0.22,
      fontSize: 7,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      transparency: 30,
    });
    slide.addText(obj.objective.replace(/_/g, " ").toUpperCase(), {
      x: x + 0.08 + colW * 0.35,
      y: y + 0.3,
      w: colW * 0.45,
      h: 0.25,
      fontSize: 13,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.primary),
      bold: true,
    });

    // "STIMA" badge — prominent
    slide.addShape(pptx.ShapeType.rect, {
      x: x + colW - 0.7,
      y: y + 0.32,
      w: 0.55,
      h: 0.22,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
      rectRadius: 0.04,
    });
    slide.addText(label(locale, "STIMA", "EST."), {
      x: x + colW - 0.7,
      y: y + 0.32,
      w: 0.55,
      h: 0.22,
      fontSize: 8,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.background),
      bold: true,
      align: "center",
    });

    // Confidence: percentage inline with bar
    slide.addText(`${label(locale, "Confidenza", "Confidence")}: ${obj.confidence}%`, {
      x: x + 0.08,
      y: y + 0.6,
      w: colW - 0.16,
      h: 0.2,
      fontSize: 9,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.text),
      bold: true,
    });
    const barW = colW - 0.16;
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.08,
      y: y + 0.8,
      w: barW,
      h: 0.1,
      fill: { color: "CCCCCC" },
      line: { type: "none" },
      rectRadius: 0.02,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.08,
      y: y + 0.8,
      w: Math.max(barW * (obj.confidence / 100), 0.02),
      h: 0.1,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
      rectRadius: 0.02,
    });

    // "Segnali" title above signals
    slide.addText(label(locale, "Segnali", "Signals"), {
      x: x + 0.08,
      y: y + 0.95,
      w: colW - 0.16,
      h: 0.18,
      fontSize: 7,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.primary),
      bold: true,
    });

    // All signals (full list, not truncated)
    obj.signals.forEach((s, j) => {
      slide.addText(`\u2022 ${s}`, {
        x: x + 0.08,
        y: y + 1.15 + j * sigLineH,
        w: colW - 0.16,
        h: sigLineH,
        fontSize: 6,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        transparency: 20,
      });
    });
  });

  // Disclaimer — clarifies this is an inference, not real campaign data
  const disclaimerY = 0.6 + topH + 0.15;
  addCardBg(slide, pptx, PAD, disclaimerY, SW - 2 * PAD, 0.4, lighten(contentBg(theme), 0.06));
  slide.addText(
    label(
      locale,
      "\u26A0 Questa è una stima basata su segnali pubblici (tipo CTA, formato ad, Advantage+, landing page). L\u2019obiettivo reale della campagna è visibile solo all\u2019inserzionista tramite Meta Ads Manager. La barra mostra il livello di confidenza della stima.",
      "\u26A0 This is an estimate based on public signals (CTA type, ad format, Advantage+, landing page). The actual campaign objective is only visible to the advertiser via Meta Ads Manager. The bar shows the confidence level of the estimate."
    ),
    {
      x: PAD + 0.1,
      y: disclaimerY + 0.05,
      w: SW - 2 * PAD - 0.2,
      h: 0.3,
      fontSize: 7,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      transparency: 30,
      italic: true,
    }
  );

  // SEPARATE SLIDE: Format grouped bar chart (full height for readability)
  const fmtSlide = pptx.addSlide();
  addLogo(fmtSlide, theme);
  fmtSlide.background = { color: hex(contentBg(theme)) };

  fmtSlide.addText(label(locale, "Distribuzione formati", "Format distribution"), {
    x: PAD,
    y: 0.15,
    w: SW - 2 * PAD,
    h: 0.35,
    fontSize: 14,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  // Chart occupies the full width minus small margin for the bottom brand labels
  const chartH = SH - 1.3;
  fmtSlide.addChart(pptx.ChartType.bar, [
    { name: "Image", labels: brands.map((b) => b.name), values: brands.map((b) => b.imageCount) },
    { name: "Video", labels: brands.map((b) => b.name), values: brands.map((b) => b.videoCount) },
    { name: "Carousel", labels: brands.map((b) => b.name), values: brands.map((b) => b.carouselCount) },
  ], {
    x: PAD,
    y: 0.6,
    w: SW - 2 * PAD,
    h: chartH,
    barDir: "col",
    barGrouping: "clustered",
    showLegend: true,
    legendPos: "b",
    legendFontSize: 12,
    legendColor: hex(theme.colors.text),
    catAxisLabelColor: hex(theme.colors.text),
    catAxisLabelFontSize: 14,
    valAxisLabelColor: hex(theme.colors.text),
    valAxisLabelFontSize: 10,
    chartColors: [
      hex(theme.colors.primary),
      hex(theme.colors.secondary),
      hex(theme.colors.accent),
    ],
  });

  // Explicit large brand-name labels under the chart (editable as text, not baked into the chart image)
  const labelY = 0.6 + chartH + 0.05;
  const innerW = (SW - 2 * PAD) * 0.85; // chart plot area is ~85% of chart width
  const innerX = PAD + (SW - 2 * PAD) * 0.075;
  const segW = innerW / brands.length;
  brands.forEach((b, i) => {
    fmtSlide.addText(b.name, {
      x: innerX + i * segW,
      y: labelY,
      w: segW,
      h: 0.3,
      fontSize: 13,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.primary),
      bold: true,
      align: "center",
    });
  });
}

function compCtaAndPlatforms(
  pptx: PptxGenJS,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(label(locale, "CTA & Piattaforme", "CTAs & Platforms"), {
    x: PAD,
    y: 0.15,
    w: SW - 2 * PAD,
    h: 0.35,
    fontSize: 14,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  // LEFT: CTA per brand (65%)
  const leftW = (SW - 2 * PAD) * 0.6;
  const rightW = (SW - 2 * PAD) * 0.35;
  const rightX = PAD + leftW + (SW - 2 * PAD) * 0.05;
  const cardBg = lighten(contentBg(theme), 0.12);

  // CTA section — stacked bars per brand
  slide.addText(label(locale, "Top CTA per brand", "Top CTAs per brand"), {
    x: PAD,
    y: 0.6,
    w: leftW,
    h: 0.25,
    fontSize: 9,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  const ctaColW = leftW / brands.length;
  brands.forEach((b, i) => {
    const x = PAD + i * ctaColW;

    slide.addText(b.name, {
      x,
      y: 0.9,
      w: ctaColW - 0.1,
      h: 0.25,
      fontSize: 8,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.primary),
      bold: true,
    });

    const ctas = b.topCtas.slice(0, 5);
    ctas.forEach((cta, j) => {
      const maxVal = Math.max(...b.topCtas.map((c) => c.count), 1);
      const barW = Math.max(((ctaColW - 0.3) * cta.count) / maxVal, 0.1);
      const cy = 1.2 + j * 0.35;

      slide.addText(cta.name, {
        x: x + 0.05,
        y: cy,
        w: ctaColW - 0.15,
        h: 0.15,
        fontSize: 6,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        transparency: 30,
      });

      slide.addShape(pptx.ShapeType.rect, {
        x: x + 0.05,
        y: cy + 0.15,
        w: barW,
        h: 0.12,
        fill: { color: hex(theme.colors.primary) },
        line: { type: "none" },
      });

      slide.addText(String(cta.count), {
        x: x + 0.05 + barW + 0.05,
        y: cy + 0.12,
        w: 0.4,
        h: 0.18,
        fontSize: 7,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
      });
    });
  });

  // RIGHT: Platform distribution — one donut per brand (so the user can tell
  // which platform belongs to which brand, instead of an aggregated pie)
  slide.addText(label(locale, "Piattaforme per brand", "Platforms per brand"), {
    x: rightX,
    y: 0.6,
    w: rightW,
    h: 0.25,
    fontSize: 9,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  const palette = [
    hex(theme.colors.primary),
    hex(theme.colors.secondary),
    hex(theme.colors.accent),
    "8a6bb0",
    "5ba09b",
  ];

  const donutGap = 0.1;
  const donutW = (rightW - donutGap * (brands.length - 1)) / brands.length;
  const donutH = SH - 1.7;

  brands.forEach((b, i) => {
    const dx = rightX + i * (donutW + donutGap);
    const plats = b.platforms;

    // Brand name header above its donut
    slide.addText(b.name, {
      x: dx,
      y: 0.88,
      w: donutW,
      h: 0.2,
      fontSize: 8,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.primary),
      bold: true,
      align: "center",
    });

    if (plats.length > 0) {
      slide.addChart(pptx.ChartType.doughnut, [
        { name: "Platforms", labels: plats.map((p) => p.name), values: plats.map((p) => p.count) },
      ], {
        x: dx,
        y: 1.12,
        w: donutW,
        h: donutH,
        showLegend: true,
        legendPos: "b",
        legendFontSize: 9,
        legendColor: hex(theme.colors.text),
        showPercent: true,
        dataLabelFontSize: 10,
        dataLabelColor: hex(theme.colors.text),
        chartColors: palette.slice(0, plats.length),
      });
    }
  });

  // CTA commentary at bottom
  const ctaComment = generateCtaComment(brands, locale);
  if (ctaComment) {
    addCardBg(slide, pptx, PAD, SH - 0.7, SW - 2 * PAD, 0.5, lighten(contentBg(theme), 0.06));
    slide.addText(ctaComment, {
      x: PAD + 0.1,
      y: SH - 0.65,
      w: SW - 2 * PAD - 0.2,
      h: 0.4,
      fontSize: 7,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      italic: true,
      valign: "top",
    });
  }
}

// ─── Closing slide (shared) ─────────────────────────────────────

function closingSlide(
  pptx: PptxGenJS,
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  // Accent bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SW,
    h: 0.06,
    fill: { color: hex(theme.colors.primary) },
    line: { type: "none" },
  });

  if (theme.logoBase64 && theme.logoMimeType) {
    slide.addImage({
      data: `data:${theme.logoMimeType};base64,${theme.logoBase64}`,
      x: SW / 2 - 0.8,
      y: 1.2,
      w: 1.6,
      h: 1.6,
      sizing: { type: "contain", w: 1.6, h: 1.6 },
    });
  }

  slide.addText(label(locale, "Grazie.", "Thank you."), {
    x: PAD,
    y: 3.2,
    w: SW - 2 * PAD,
    h: 0.7,
    fontSize: 28,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
    align: "center",
  });

  slide.addText("Powered by AISCAN", {
    x: PAD,
    y: 4.0,
    w: SW - 2 * PAD,
    h: 0.35,
    fontSize: 9,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
    transparency: 50,
    align: "center",
  });
}

// ─── Benchmark slides ───────────────────────────────────────────

function benchmarkSlide(
  pptx: PptxGenJS,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  const chartOpts = {
    catAxisLabelColor: hex(theme.colors.text),
    catAxisLabelFontSize: 12,
    valAxisLabelColor: hex(theme.colors.text),
    valAxisLabelFontSize: 10,
    showLegend: true,
    legendPos: "b" as const,
    legendFontSize: 11,
    legendColor: hex(theme.colors.text),
  };
  const palette = [hex(theme.colors.primary), hex(theme.colors.secondary), hex(theme.colors.accent), "8a6bb0", "5ba09b"];

  // ─── Slide A: Volume + KPI summary ────────────────
  {
    const s = pptx.addSlide();
    addLogo(s, theme);
    s.background = { color: hex(contentBg(theme)) };
    s.addText(label(locale, "Benchmark — Volume & KPI", "Benchmark — Volume & KPIs"), {
      x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
      fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });

    // KPI cards row
    const kpiW = (SW - 2 * PAD - 0.1 * 3) / 4;
    const kpis = [
      { lbl: label(locale, "Ads totali", "Total ads"), val: String(brands.reduce((s, b) => s + b.totalAds, 0)) },
      { lbl: label(locale, "Ads attive", "Active ads"), val: String(brands.reduce((s, b) => s + b.activeAds, 0)) },
      { lbl: label(locale, "Durata media", "Avg. duration"), val: `${Math.round(brands.reduce((s, b) => s + b.avgDuration, 0) / brands.length)}${label(locale, "gg", "d")}` },
      { lbl: label(locale, "Refresh rate", "Refresh rate"), val: `${Math.round(brands.reduce((s, b) => s + b.adsPerWeek, 0) / brands.length * 10) / 10}/${label(locale, "sett", "wk")}` },
    ];
    kpis.forEach((k, i) => {
      const kx = PAD + i * (kpiW + 0.1);
      addCardBg(s, pptx, kx, 0.6, kpiW, 0.55, lighten(contentBg(theme), 0.1));
      s.addText(k.lbl, { x: kx + 0.08, y: 0.63, w: kpiW - 0.16, h: 0.18, fontSize: 6, fontFace: theme.fonts.body, color: hex(theme.colors.text), transparency: 40 });
      s.addText(k.val, { x: kx + 0.08, y: 0.8, w: kpiW - 0.16, h: 0.3, fontSize: 16, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true });
    });

    // Volume bar chart (active vs inactive per brand)
    s.addChart(pptx.ChartType.bar, [
      { name: "Active", labels: brands.map((b) => b.name), values: brands.map((b) => b.activeAds) },
      { name: "Inactive", labels: brands.map((b) => b.name), values: brands.map((b) => b.totalAds - b.activeAds) },
    ], {
      x: PAD, y: 1.35, w: SW - 2 * PAD, h: SH - 1.6,
      barDir: "col", barGrouping: "stacked",
      chartColors: [hex(theme.colors.primary), "3a3a3a"],
      ...chartOpts,
    });
  }

  // ─── Slide B: Format distribution + Platform per brand ────
  {
    const s = pptx.addSlide();
    addLogo(s, theme);
    s.background = { color: hex(contentBg(theme)) };
    s.addText(label(locale, "Benchmark — Formati & Piattaforme", "Benchmark — Formats & Platforms"), {
      x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
      fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });

    // Format clustered bar
    s.addText(label(locale, "Distribuzione formati per brand", "Format distribution per brand"), {
      x: PAD, y: 0.55, w: SW - 2 * PAD, h: 0.2, fontSize: 8, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    s.addChart(pptx.ChartType.bar, [
      { name: "Image", labels: brands.map((b) => b.name), values: brands.map((b) => b.imageCount) },
      { name: "Video", labels: brands.map((b) => b.name), values: brands.map((b) => b.videoCount) },
      { name: "Carousel", labels: brands.map((b) => b.name), values: brands.map((b) => b.carouselCount) },
    ], {
      x: PAD, y: 0.8, w: (SW - 2 * PAD) * 0.55, h: SH - 1.1,
      barDir: "col", barGrouping: "clustered",
      chartColors: [hex(theme.colors.primary), hex(theme.colors.secondary), hex(theme.colors.accent)],
      ...chartOpts,
    });

    // Platform pie per brand (side by side) — one donut per brand so the
    // reader can attribute each platform share to its brand
    s.addText(label(locale, "Piattaforme per brand", "Platforms per brand"), {
      x: PAD + (SW - 2 * PAD) * 0.58, y: 0.55, w: (SW - 2 * PAD) * 0.42, h: 0.2,
      fontSize: 8, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    const platRightX = PAD + (SW - 2 * PAD) * 0.58;
    const platW = (SW - 2 * PAD) * 0.42;
    const gapB = 0.08;
    const brandDonutW = (platW - gapB * (brands.length - 1)) / brands.length;
    brands.forEach((b, i) => {
      const dx = platRightX + i * (brandDonutW + gapB);
      s.addText(b.name, {
        x: dx, y: 0.78, w: brandDonutW, h: 0.18,
        fontSize: 8, fontFace: theme.fonts.heading,
        color: hex(theme.colors.primary), bold: true, align: "center",
      });
      if (b.platforms.length > 0) {
        s.addChart(pptx.ChartType.doughnut, [
          { name: "Platforms", labels: b.platforms.map((p) => p.name), values: b.platforms.map((p) => p.count) },
        ], {
          x: dx, y: 0.98, w: brandDonutW, h: SH - 1.28,
          showPercent: true, dataLabelFontSize: 10, dataLabelColor: hex(theme.colors.text),
          chartColors: palette.slice(0, b.platforms.length),
          ...chartOpts,
        });
      }
    });
  }

  // ─── Slide C: Duration + Copy length + Refresh rate ────
  {
    const s = pptx.addSlide();
    addLogo(s, theme);
    s.background = { color: hex(contentBg(theme)) };
    s.addText(label(locale, "Benchmark — Metriche per brand", "Benchmark — Metrics per brand"), {
      x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
      fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });

    const colW3 = (SW - 2 * PAD - 0.2) / 3;

    // Duration bar
    s.addText(label(locale, "Durata media (gg)", "Avg. duration (d)"), {
      x: PAD, y: 0.55, w: colW3, h: 0.22, fontSize: 10, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    s.addChart(pptx.ChartType.bar, [
      { name: label(locale, "Giorni", "Days"), labels: brands.map((b) => b.name), values: brands.map((b) => b.avgDuration) },
    ], {
      x: PAD, y: 0.8, w: colW3, h: SH - 1.1,
      barDir: "bar", chartColors: ["5b7ea3"],
      ...chartOpts, showLegend: false,
    });

    // Copy length bar
    s.addText(label(locale, "Lungh. copy (chr)", "Copy length (chr)"), {
      x: PAD + colW3 + 0.1, y: 0.55, w: colW3, h: 0.22, fontSize: 10, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    s.addChart(pptx.ChartType.bar, [
      { name: "chr", labels: brands.map((b) => b.name), values: brands.map((b) => b.avgCopyLength) },
    ], {
      x: PAD + colW3 + 0.1, y: 0.8, w: colW3, h: SH - 1.1,
      barDir: "bar", chartColors: ["6b8e6b"],
      ...chartOpts, showLegend: false,
    });

    // Refresh rate bar
    s.addText(label(locale, "Refresh rate (ads/sett.)", "Refresh rate (ads/wk)"), {
      x: PAD + 2 * (colW3 + 0.1), y: 0.55, w: colW3, h: 0.22, fontSize: 10, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    s.addChart(pptx.ChartType.bar, [
      { name: "ads/wk", labels: brands.map((b) => b.name), values: brands.map((b) => b.adsPerWeek) },
    ], {
      x: PAD + 2 * (colW3 + 0.1), y: 0.8, w: colW3, h: SH - 1.1,
      barDir: "bar", chartColors: ["a06b5b"],
      ...chartOpts, showLegend: false,
    });
  }

  // ─── Slide D: Advantage+ usage + avg variants per ad ────
  const hasAdvantage = brands.some((b) => (b.advantagePlusPercent ?? 0) > 0);
  const hasVariants = brands.some((b) => (b.avgVariants ?? 0) > 0);
  if (hasAdvantage || hasVariants) {
    const s = pptx.addSlide();
    addLogo(s, theme);
    s.background = { color: hex(contentBg(theme)) };
    s.addText(label(locale, "Benchmark — Automazione & Varianti", "Benchmark — Automation & Variants"), {
      x: PAD, y: 0.15, w: SW - 2 * PAD, h: 0.35,
      fontSize: 14, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });

    const colW2 = (SW - 2 * PAD - 0.2) / 2;

    // Advantage+ per brand (%)
    s.addText(label(locale, "Advantage+ per brand (%)", "Advantage+ per brand (%)"), {
      x: PAD, y: 0.55, w: colW2, h: 0.22,
      fontSize: 10, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    s.addText(label(
      locale,
      "Percentuale di ads che usano l'ottimizzazione automatica Advantage+ di Meta.",
      "Percentage of ads using Meta's Advantage+ automatic optimization."
    ), {
      x: PAD, y: 0.78, w: colW2, h: 0.3,
      fontSize: 8, fontFace: theme.fonts.body, color: hex(theme.colors.text), transparency: 30,
    });
    s.addChart(pptx.ChartType.bar, [
      { name: "%", labels: brands.map((b) => b.name), values: brands.map((b) => b.advantagePlusPercent ?? 0) },
    ], {
      x: PAD, y: 1.15, w: colW2, h: SH - 1.45,
      barDir: "bar", chartColors: [hex(theme.colors.primary)],
      ...chartOpts, showLegend: false,
    });

    // Avg variants per ad
    s.addText(label(locale, "Varianti medie per ad", "Avg. variants per ad"), {
      x: PAD + colW2 + 0.2, y: 0.55, w: colW2, h: 0.22,
      fontSize: 10, fontFace: theme.fonts.heading, color: hex(theme.colors.primary), bold: true,
    });
    s.addText(label(
      locale,
      "Numero medio di varianti (test A/B) generate per ogni ad dal brand.",
      "Average number of variants (A/B tests) generated per ad by each brand."
    ), {
      x: PAD + colW2 + 0.2, y: 0.78, w: colW2, h: 0.3,
      fontSize: 8, fontFace: theme.fonts.body, color: hex(theme.colors.text), transparency: 30,
    });
    s.addChart(pptx.ChartType.bar, [
      { name: "variants", labels: brands.map((b) => b.name), values: brands.map((b) => b.avgVariants ?? 0) },
    ], {
      x: PAD + colW2 + 0.2, y: 1.15, w: colW2, h: SH - 1.45,
      barDir: "bar", chartColors: [hex(theme.colors.secondary)],
      ...chartOpts, showLegend: false,
    });
  }
}

// ─── Main entry points ──────────────────────────────────────────

export async function generateSinglePptx(
  brand: BrandData,
  theme?: ThemeConfig | null,
  locale: Locale = "it",
  sections: SectionType[] = ["technical"],
  copyAnalysis?: CreativeAnalysisResult["copywriterReport"] | null,
  visualAnalysis?: CreativeAnalysisResult["creativeDirectorReport"] | null,
  channel: string = "meta"
): Promise<Buffer> {
  const t = theme ?? DEFAULT_THEME;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "CUSTOM", width: SW, height: SH });
  pptx.layout = "CUSTOM";
  pptx.author = "AISCAN";
  pptx.title = `${brand.name} \u2014 Report`;

  const hasTechnical = sections.includes("technical");
  const hasCopy = sections.includes("copy");
  const hasVisual = sections.includes("visual");
  const hasBenchmark = sections.includes("benchmark");

  // Slide 1: Cover
  singleCover(pptx, brand, t, locale, channel);

  // Slide 2: Full Dashboard (technical)
  if (hasTechnical) {
    singleDashboard(pptx, brand, t, locale);
  }

  // Slide 3: Objective + Format pie (technical)
  if (hasTechnical) {
    singleObjectiveAndFormat(pptx, brand, t, locale);
  }

  // Slide 4: Latest Ads (technical) — dedicated per-brand slide with detailed cards
  if (hasTechnical) {
    latestAdsSlideForBrand(pptx, brand, t, locale);
  }

  // Benchmark slide
  if (hasBenchmark) {
    benchmarkSlide(pptx, [brand], t, locale);
  }

  // Slide 5: Copy Analysis (if selected and data available)
  if (hasCopy && copyAnalysis?.brandAnalyses?.length) {
    addCopyAnalysisSlide(
      pptx,
      copyAnalysis.brandAnalyses,
      copyAnalysis.comparison ?? "",
      t,
      locale,
      [brand]
    );
  }

  // Slide 6: Visual Analysis (if selected and data available)
  if (hasVisual && visualAnalysis?.brandAnalyses?.length) {
    addVisualAnalysisSlide(
      pptx,
      visualAnalysis.brandAnalyses,
      visualAnalysis.comparison ?? "",
      t,
      locale
    );
  }

  // Closing
  closingSlide(pptx, t, locale);

  const output = await pptx.write({ outputType: "nodebuffer" });
  return output as Buffer;
}

export async function generateComparisonPptx(
  brands: BrandData[],
  theme?: ThemeConfig | null,
  locale: Locale = "it",
  sections: SectionType[] = ["technical"],
  copyAnalysis?: CreativeAnalysisResult["copywriterReport"] | null,
  visualAnalysis?: CreativeAnalysisResult["creativeDirectorReport"] | null,
  channel: string = "meta"
): Promise<Buffer> {
  const t = theme ?? DEFAULT_THEME;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "CUSTOM", width: SW, height: SH });
  pptx.layout = "CUSTOM";
  pptx.author = "AISCAN";
  pptx.title = `${brands.map((b) => b.name).join(" vs ")} \u2014 Comparison Report`;

  const hasTechnical = sections.includes("technical");
  const hasCopy = sections.includes("copy");
  const hasVisual = sections.includes("visual");
  const hasBenchmark = sections.includes("benchmark");

  // Slide 1: Cover
  compCover(pptx, brands, t, locale, channel);

  // Slide 2: Overview Dashboard table
  if (hasTechnical) {
    compOverviewDashboard(pptx, brands, t, locale);
  }

  // Slide 3: Objectives + Format Distribution
  if (hasTechnical) {
    compObjectivesAndFormat(pptx, brands, t, locale);
  }

  // Slide 4: CTA + Platforms
  if (hasTechnical) {
    compCtaAndPlatforms(pptx, brands, t, locale);
  }

  // Slide 5: Latest Ads — one dedicated slide per brand with detailed cards
  if (hasTechnical) {
    for (const b of brands) {
      latestAdsSlideForBrand(pptx, b, t, locale);
    }
  }

  // Benchmark slide
  if (hasBenchmark) {
    benchmarkSlide(pptx, brands, t, locale);
  }

  // Slide 6: Copy Analysis
  if (hasCopy && copyAnalysis?.brandAnalyses?.length) {
    addCopyAnalysisSlide(
      pptx,
      copyAnalysis.brandAnalyses,
      copyAnalysis.comparison ?? "",
      t,
      locale,
      brands
    );
  }

  // Slide 7: Visual Analysis
  if (hasVisual && visualAnalysis?.brandAnalyses?.length) {
    addVisualAnalysisSlide(
      pptx,
      visualAnalysis.brandAnalyses,
      visualAnalysis.comparison ?? "",
      t,
      locale,
      brands
    );
  }

  // Closing
  closingSlide(pptx, t, locale);

  const output = await pptx.write({ outputType: "nodebuffer" });
  return output as Buffer;
}
