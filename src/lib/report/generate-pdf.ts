import { jsPDF } from "jspdf";
import { type ThemeConfig, DEFAULT_THEME } from "./parse-template";
import type { BrandData, SectionType } from "./generate-pptx";
import type { CreativeAnalysisResult } from "@/lib/ai/creative-analysis";

type Locale = "it" | "en";

// ─── Helpers ─────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
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

function trunc(text: string | null | undefined, max: number): string {
  if (!text) return "\u2014";
  return text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
}

// Page dimensions (landscape A4)
const PW = 297; // mm
const PH = 210;
const MARGIN = 12;
const CW = PW - 2 * MARGIN;

/**
 * Fill the entire page with the background color.
 */
function fillBg(doc: jsPDF, theme: ThemeConfig) {
  const [r, g, b] = hexToRgb(theme.colors.background);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, PW, PH, "F");
}

/**
 * Draw a horizontal colored bar chart.
 */
function drawBarChart(
  doc: jsPDF,
  items: { name: string; value: number }[],
  x: number,
  y: number,
  maxWidth: number,
  theme: ThemeConfig
) {
  if (items.length === 0) return;
  const maxVal = Math.max(...items.map((i) => i.value), 1);
  const barHeight = 5;
  const gap = 3;

  items.forEach((item, i) => {
    const cy = y + i * (barHeight + gap);

    const [tr, tg, tb] = hexToRgb(theme.colors.text);
    doc.setFontSize(7);
    doc.setTextColor(tr, tg, tb);
    doc.text(item.name, x, cy + barHeight / 2 + 1);

    doc.setFillColor(50, 50, 50);
    doc.rect(x + 40, cy, maxWidth - 40, barHeight, "F");

    const barW = ((maxWidth - 40) * item.value) / maxVal;
    const [pr, pg, pb] = hexToRgb(theme.colors.primary);
    doc.setFillColor(pr, pg, pb);
    doc.rect(x + 40, cy, Math.max(barW, 1), barHeight, "F");

    doc.setFontSize(6);
    doc.setTextColor(tr, tg, tb);
    doc.text(String(item.value), x + 40 + barW + 2, cy + barHeight / 2 + 1);
  });
}

/**
 * Draw a proportional bar (faux pie).
 */
function drawProportionalBar(
  doc: jsPDF,
  items: { name: string; value: number; color: string }[],
  x: number,
  y: number,
  width: number,
  theme: ThemeConfig
) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (total === 0) return;

  let cx = x;
  items.forEach((item) => {
    const w = (item.value / total) * width;
    const [r, g, b] = hexToRgb(item.color);
    doc.setFillColor(r, g, b);
    doc.rect(cx, y, w, 8, "F");
    cx += w;
  });

  let lx = x;
  const [tr, tg, tb] = hexToRgb(theme.colors.text);
  doc.setFontSize(6);
  doc.setTextColor(tr, tg, tb);
  items.forEach((item) => {
    const [r, g, b] = hexToRgb(item.color);
    doc.setFillColor(r, g, b);
    doc.rect(lx, y + 11, 3, 3, "F");
    const pct = Math.round((item.value / total) * 100);
    doc.text(`${item.name} (${pct}%)`, lx + 5, y + 13.5);
    lx += 45;
  });
}

// ─── Single brand PDF slides (dense) ────────────────────────────

function addPdfCoverPage(
  doc: jsPDF,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale
) {
  fillBg(doc, theme);

  // Accent bar
  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, PW, 2, "F");

  if (theme.logoBase64 && theme.logoMimeType) {
    try {
      const ext = theme.logoMimeType.includes("png") ? "PNG" : "JPEG";
      doc.addImage(
        `data:${theme.logoMimeType};base64,${theme.logoBase64}`,
        ext,
        MARGIN,
        10,
        30,
        30
      );
    } catch {
      // skip
    }
  }

  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(32);
  doc.setTextColor(pr, pg, pb);
  doc.text(brand.name, MARGIN, 70);

  doc.setFontSize(16);
  doc.setTextColor(tr, tg, tb);
  doc.text(label(locale, "Report Analisi Ads", "Ads Analysis Report"), MARGIN, 85);

  doc.setFontSize(11);
  doc.setTextColor(tr, tg, tb);
  doc.text(formatDate(locale), MARGIN, 97);

  doc.setFontSize(8);
  doc.setTextColor(pr, pg, pb);
  doc.text("Powered by AISCAN", MARGIN, PH - 10);
}

function addPdfDashboardPage(
  doc: jsPDF,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Dashboard", "Dashboard"), MARGIN, 18);

  // Stat cards (4 across)
  const total = brand.imageCount + brand.videoCount + brand.carouselCount;
  const imgPct = total > 0 ? Math.round((brand.imageCount / total) * 100) : 0;
  const vidPct = total > 0 ? Math.round((brand.videoCount / total) * 100) : 0;
  const carPct = total > 0 ? Math.round((brand.carouselCount / total) * 100) : 0;

  const stats = [
    { lbl: label(locale, "Ads totali", "Total ads"), val: String(brand.totalAds) },
    { lbl: label(locale, "Ads attive", "Active ads"), val: String(brand.activeAds) },
    { lbl: label(locale, "Durata media", "Avg. duration"), val: brand.avgDuration > 0 ? `${brand.avgDuration}${label(locale, "gg", "d")}` : "\u2014" },
    { lbl: label(locale, "Refresh rate", "Refresh rate"), val: brand.adsPerWeek > 0 ? `${brand.adsPerWeek}/wk` : "\u2014" },
  ];

  const cardW = (CW - 12) / 4;
  stats.forEach((s, i) => {
    const x = MARGIN + i * (cardW + 4);
    const y = 26;

    doc.setFillColor(26, 26, 26);
    doc.roundedRect(x, y, cardW, 22, 2, 2, "F");

    doc.setFontSize(7);
    doc.setTextColor(tr, tg, tb);
    doc.text(s.lbl, x + 4, y + 8);

    doc.setFontSize(16);
    doc.setTextColor(pr, pg, pb);
    doc.text(s.val, x + 4, y + 18);
  });

  // Second row
  const row2y = 54;
  // Copy length
  doc.setFillColor(26, 26, 26);
  doc.roundedRect(MARGIN, row2y, CW / 2 - 2, 18, 2, 2, "F");
  doc.setFontSize(7);
  doc.setTextColor(tr, tg, tb);
  doc.text(label(locale, "Lunghezza media copy", "Avg. copy length"), MARGIN + 4, row2y + 8);
  doc.setFontSize(14);
  doc.setTextColor(pr, pg, pb);
  doc.text(brand.avgCopyLength > 0 ? `${brand.avgCopyLength} ${label(locale, "chr", "chr")}` : "\u2014", MARGIN + 4, row2y + 15);

  // Format mix
  const fmx = MARGIN + CW / 2 + 2;
  doc.setFillColor(26, 26, 26);
  doc.roundedRect(fmx, row2y, CW / 2 - 2, 18, 2, 2, "F");
  doc.setFontSize(7);
  doc.setTextColor(tr, tg, tb);
  doc.text(label(locale, "Format mix", "Format mix"), fmx + 4, row2y + 8);
  doc.setFontSize(10);
  doc.setTextColor(tr, tg, tb);
  doc.text(`${imgPct}% Img  |  ${vidPct}% Vid  |  ${carPct}% Car`, fmx + 4, row2y + 15);

  // Bottom: CTA bars + Platforms proportional bar
  const botY = 80;
  doc.setFontSize(10);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Top CTA", "Top CTAs"), MARGIN, botY);

  drawBarChart(
    doc,
    brand.topCtas.slice(0, 6).map((c) => ({ name: c.name, value: c.count })),
    MARGIN,
    botY + 5,
    CW * 0.55,
    theme
  );

  const platX = MARGIN + CW * 0.6;
  doc.setFontSize(10);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Piattaforme", "Platforms"), platX, botY);

  const palette = [
    theme.colors.primary,
    theme.colors.secondary,
    theme.colors.accent,
    "#8a6bb0",
    "#5ba09b",
  ];
  drawProportionalBar(
    doc,
    brand.platforms.map((p, i) => ({
      name: p.name,
      value: p.count,
      color: palette[i % palette.length],
    })),
    platX,
    botY + 5,
    CW * 0.38,
    theme
  );

  // Objective section (bottom area)
  const objY = 135;
  const obj = brand.objectiveInference;

  doc.setFontSize(10);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Obiettivo campagna (stimato)", "Campaign objective (estimated)"), MARGIN, objY);

  doc.setFontSize(14);
  doc.setTextColor(tr, tg, tb);
  doc.text(obj.objective.replace(/_/g, " ").toUpperCase(), MARGIN, objY + 10);

  // Confidence bar
  doc.setFillColor(50, 50, 50);
  doc.rect(MARGIN, objY + 14, CW * 0.4, 4, "F");
  doc.setFillColor(pr, pg, pb);
  doc.rect(MARGIN, objY + 14, CW * 0.4 * (obj.confidence / 100), 4, "F");
  doc.setFontSize(8);
  doc.setTextColor(tr, tg, tb);
  doc.text(`${obj.confidence}%`, MARGIN + CW * 0.4 + 4, objY + 17);

  // Signals
  doc.setFontSize(7);
  let sy = objY + 24;
  obj.signals.slice(0, 5).forEach((s) => {
    doc.text(`\u2022 ${s}`, MARGIN + 2, sy);
    sy += 5;
  });

  // Format proportional bar
  drawProportionalBar(
    doc,
    [
      { name: "Image", value: brand.imageCount, color: theme.colors.primary },
      { name: "Video", value: brand.videoCount, color: theme.colors.secondary },
      { name: "Carousel", value: brand.carouselCount, color: theme.colors.accent },
    ],
    MARGIN + CW * 0.55,
    objY + 5,
    CW * 0.43,
    theme
  );
}

function addPdfLatestAdsPage(
  doc: jsPDF,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Ultime Ads", "Latest Ads"), MARGIN, 18);

  const ads = brand.latestAds.slice(0, 6);
  const cols = 3;
  const cardW = (CW - 8) / cols;
  const cardH = 50;

  ads.forEach((ad, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * (cardW + 4);
    const y = 26 + row * (cardH + 6);

    const headline = ad.headline ?? `Ad #${ad.ad_archive_id.slice(0, 10)}`;

    doc.setFillColor(26, 26, 26);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");

    // Top accent line
    doc.setFillColor(pr, pg, pb);
    doc.rect(x, y, cardW, 1.5, "F");

    doc.setFontSize(8);
    doc.setTextColor(tr, tg, tb);
    doc.text(headline, x + 4, y + 12, { maxWidth: cardW - 8 });

    doc.setFontSize(5);
    doc.setTextColor(tr, tg, tb);
    doc.text(`ID: ${ad.ad_archive_id.slice(0, 18)}\u2026`, x + 4, y + cardH - 4);
  });
}

// ─── AI Analysis pages (PDF) ────────────────────────────────────

function addPdfCopyAnalysis(
  doc: jsPDF,
  copyReport: NonNullable<CreativeAnalysisResult["copywriterReport"]>,
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Analisi Copy (AI)", "Copy Analysis (AI)"), MARGIN, 18);

  const analyses = copyReport.brandAnalyses;
  const numBrands = analyses.length;
  const colW = (CW - (numBrands - 1) * 4) / numBrands;

  analyses.forEach((a, i) => {
    const x = MARGIN + i * (colW + 4);
    let y = 28;

    // Brand name header
    doc.setFillColor(pr, pg, pb);
    doc.rect(x, y, colW, 7, "F");
    const [bgr, bgg, bgb] = hexToRgb(theme.colors.background);
    doc.setFontSize(8);
    doc.setTextColor(bgr, bgg, bgb);
    doc.text(a.brandName, x + 3, y + 5);
    y += 10;

    const fields: [string, string][] = [
      [label(locale, "Tono di voce", "Tone of voice"), trunc(a.toneOfVoice, 100)],
      [label(locale, "Stile copy", "Copy style"), trunc(a.copyStyle, 100)],
      [label(locale, "Trigger emozionali", "Emotional triggers"), a.emotionalTriggers?.join(", ") ?? "\u2014"],
      [label(locale, "Pattern CTA", "CTA patterns"), trunc(a.ctaPatterns, 90)],
      [label(locale, "Punti di forza", "Strengths"), trunc(a.strengths, 90)],
      [label(locale, "Punti deboli", "Weaknesses"), trunc(a.weaknesses, 90)],
    ];

    fields.forEach(([lbl, val]) => {
      doc.setFontSize(6);
      doc.setTextColor(pr, pg, pb);
      doc.text(lbl, x + 2, y);

      doc.setFontSize(7);
      doc.setTextColor(tr, tg, tb);
      const lines = doc.splitTextToSize(val, colW - 6);
      doc.text(lines, x + 2, y + 5);
      y += 5 + lines.length * 3.5 + 3;
    });
  });

  // Comparison at bottom
  if (copyReport.comparison) {
    const compY = PH - 40;
    doc.setFillColor(pr, pg, pb);
    doc.rect(MARGIN, compY, CW, 0.8, "F");
    doc.setFontSize(7);
    doc.setTextColor(tr, tg, tb);
    const compLines = doc.splitTextToSize(trunc(copyReport.comparison, 500), CW - 8);
    doc.text(compLines, MARGIN + 2, compY + 5);
  }
}

function addPdfVisualAnalysis(
  doc: jsPDF,
  visualReport: NonNullable<CreativeAnalysisResult["creativeDirectorReport"]>,
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Analisi Creativa (AI)", "Creative Analysis (AI)"), MARGIN, 18);

  const analyses = visualReport.brandAnalyses;
  const numBrands = analyses.length;
  const colW = (CW - (numBrands - 1) * 4) / numBrands;

  analyses.forEach((a, i) => {
    const x = MARGIN + i * (colW + 4);
    let y = 28;

    doc.setFillColor(pr, pg, pb);
    doc.rect(x, y, colW, 7, "F");
    const [bgr, bgg, bgb] = hexToRgb(theme.colors.background);
    doc.setFontSize(8);
    doc.setTextColor(bgr, bgg, bgb);
    doc.text(a.brandName, x + 3, y + 5);
    y += 10;

    const fields: [string, string][] = [
      [label(locale, "Stile visivo", "Visual style"), trunc(a.visualStyle, 100)],
      [label(locale, "Palette colori", "Color palette"), trunc(a.colorPalette, 100)],
      [label(locale, "Stile fotografico", "Photography style"), trunc(a.photographyStyle, 100)],
      [label(locale, "Coerenza brand", "Brand consistency"), trunc(a.brandConsistency, 90)],
      [label(locale, "Preferenze formato", "Format preferences"), trunc(a.formatPreferences, 90)],
      [label(locale, "Punti di forza", "Strengths"), trunc(a.strengths, 90)],
      [label(locale, "Punti deboli", "Weaknesses"), trunc(a.weaknesses, 90)],
    ];

    fields.forEach(([lbl, val]) => {
      doc.setFontSize(6);
      doc.setTextColor(pr, pg, pb);
      doc.text(lbl, x + 2, y);

      doc.setFontSize(7);
      doc.setTextColor(tr, tg, tb);
      const lines = doc.splitTextToSize(val, colW - 6);
      doc.text(lines, x + 2, y + 5);
      y += 5 + lines.length * 3.5 + 3;
    });
  });

  if (visualReport.comparison) {
    const compY = PH - 40;
    doc.setFillColor(pr, pg, pb);
    doc.rect(MARGIN, compY, CW, 0.8, "F");
    doc.setFontSize(7);
    doc.setTextColor(tr, tg, tb);
    const compLines = doc.splitTextToSize(trunc(visualReport.comparison, 500), CW - 8);
    doc.text(compLines, MARGIN + 2, compY + 5);
  }
}

// ─── Closing ────────────────────────────────────────────────────

function addPdfClosingPage(
  doc: jsPDF,
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  // Accent bar
  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, PW, 2, "F");

  if (theme.logoBase64 && theme.logoMimeType) {
    try {
      const ext = theme.logoMimeType.includes("png") ? "PNG" : "JPEG";
      doc.addImage(
        `data:${theme.logoMimeType};base64,${theme.logoBase64}`,
        ext,
        PW / 2 - 15,
        35,
        30,
        30
      );
    } catch {
      // skip
    }
  }

  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(28);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Grazie.", "Thank you."), PW / 2, 95, {
    align: "center",
  });

  doc.setFontSize(9);
  doc.setTextColor(tr, tg, tb);
  doc.text("Powered by AISCAN", PW / 2, 110, {
    align: "center",
  });
}

// ─── Comparison PDF pages (dense) ───────────────────────────────

function addPdfComparisonCover(
  doc: jsPDF,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  doc.setFillColor(pr, pg, pb);
  doc.rect(0, 0, PW, 2, "F");

  if (theme.logoBase64 && theme.logoMimeType) {
    try {
      const ext = theme.logoMimeType.includes("png") ? "PNG" : "JPEG";
      doc.addImage(
        `data:${theme.logoMimeType};base64,${theme.logoBase64}`,
        ext,
        MARGIN,
        10,
        30,
        30
      );
    } catch {
      // skip
    }
  }

  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(28);
  doc.setTextColor(pr, pg, pb);
  doc.text(brands.map((b) => b.name).join(" vs "), MARGIN, 70);

  doc.setFontSize(16);
  doc.setTextColor(tr, tg, tb);
  doc.text(
    label(locale, "Report Confronto", "Comparison Report"),
    MARGIN,
    85
  );

  doc.setFontSize(11);
  doc.setTextColor(tr, tg, tb);
  doc.text(formatDate(locale), MARGIN, 97);

  doc.setFontSize(8);
  doc.setTextColor(pr, pg, pb);
  doc.text("Powered by AISCAN", MARGIN, PH - 10);
}

function addPdfComparisonDashboard(
  doc: jsPDF,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Panoramica Comparativa", "Comparative Overview"), MARGIN, 18);

  // Table
  const colW = CW / (brands.length + 1);
  let y = 30;

  // Header
  doc.setFillColor(pr, pg, pb);
  doc.rect(MARGIN, y - 5, CW, 8, "F");
  const [bgr, bgg, bgb] = hexToRgb(theme.colors.background);
  doc.setFontSize(8);
  doc.setTextColor(bgr, bgg, bgb);
  brands.forEach((b, i) => {
    doc.text(b.name, MARGIN + colW * (i + 1), y, { maxWidth: colW - 4 });
  });

  y += 8;

  const total = (b: BrandData) => b.imageCount + b.videoCount + b.carouselCount;
  const fmtMix = (b: BrandData) => {
    const t = total(b);
    if (t === 0) return "\u2014";
    return `${Math.round((b.imageCount / t) * 100)}%I ${Math.round((b.videoCount / t) * 100)}%V ${Math.round((b.carouselCount / t) * 100)}%C`;
  };

  const metrics: [string, (b: BrandData) => string][] = [
    [label(locale, "Ads totali", "Total ads"), (b) => String(b.totalAds)],
    [label(locale, "Ads attive", "Active ads"), (b) => String(b.activeAds)],
    [label(locale, "Durata media", "Avg. duration"), (b) => b.avgDuration > 0 ? `${b.avgDuration}${label(locale, "gg", "d")}` : "\u2014"],
    [label(locale, "Lungh. copy", "Copy length"), (b) => b.avgCopyLength > 0 ? `${b.avgCopyLength}` : "\u2014"],
    [label(locale, "Refresh rate", "Refresh rate"), (b) => b.adsPerWeek > 0 ? `${b.adsPerWeek}/wk` : "\u2014"],
    [label(locale, "Format mix", "Format mix"), fmtMix],
  ];

  metrics.forEach(([lbl, fn], idx) => {
    // Alternating row bg
    if (idx % 2 === 0) {
      doc.setFillColor(20, 20, 20);
      doc.rect(MARGIN, y - 3, CW, 10, "F");
    }

    doc.setFontSize(8);
    doc.setTextColor(tr, tg, tb);
    doc.text(lbl, MARGIN + 2, y + 3);

    doc.setTextColor(pr, pg, pb);
    brands.forEach((b, i) => {
      doc.text(fn(b), MARGIN + colW * (i + 1), y + 3);
    });

    y += 10;
  });

  // Objectives section below
  y += 5;
  doc.setFontSize(12);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Obiettivi Campagna", "Campaign Objectives"), MARGIN, y);
  y += 8;

  brands.forEach((b, i) => {
    const x = MARGIN + i * colW + (i > 0 ? colW : 0);
    const obj = b.objectiveInference;

    doc.setFontSize(8);
    doc.setTextColor(pr, pg, pb);
    doc.text(b.name, x, y);

    doc.setFontSize(10);
    doc.setTextColor(tr, tg, tb);
    doc.text(obj.objective.replace(/_/g, " ").toUpperCase(), x, y + 8);

    // Confidence bar
    const barW = colW - 10;
    doc.setFillColor(50, 50, 50);
    doc.rect(x, y + 12, barW, 3, "F");
    doc.setFillColor(pr, pg, pb);
    doc.rect(x, y + 12, barW * (obj.confidence / 100), 3, "F");

    doc.setFontSize(6);
    doc.setTextColor(tr, tg, tb);
    doc.text(`${obj.confidence}%`, x + barW + 2, y + 14);

    // Top signals
    doc.setFontSize(6);
    let sy = y + 20;
    obj.signals.slice(0, 3).forEach((s) => {
      doc.text(`\u2022 ${s}`, x + 1, sy);
      sy += 4;
    });
  });

  // Format distribution bar at the very bottom
  const fmtY = PH - 35;
  doc.setFontSize(10);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Distribuzione Formati", "Format Distribution"), MARGIN, fmtY);

  brands.forEach((b, i) => {
    const x = MARGIN + i * (CW / brands.length);
    const w = CW / brands.length - 4;

    doc.setFontSize(7);
    doc.setTextColor(pr, pg, pb);
    doc.text(b.name, x, fmtY + 7);

    drawProportionalBar(
      doc,
      [
        { name: "Img", value: b.imageCount, color: theme.colors.primary },
        { name: "Vid", value: b.videoCount, color: theme.colors.secondary },
        { name: "Car", value: b.carouselCount, color: theme.colors.accent },
      ],
      x,
      fmtY + 10,
      w,
      theme
    );
  });
}

function addPdfComparisonCtaAndPlatforms(
  doc: jsPDF,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "CTA & Piattaforme", "CTAs & Platforms"), MARGIN, 18);

  // CTAs per brand
  const ctaW = CW * 0.55;
  doc.setFontSize(10);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Top CTA", "Top CTAs"), MARGIN, 28);

  const ctaColW = ctaW / brands.length;
  brands.forEach((b, i) => {
    const x = MARGIN + i * ctaColW;

    doc.setFontSize(8);
    doc.setTextColor(pr, pg, pb);
    doc.text(b.name, x, 36);

    doc.setFontSize(7);
    doc.setTextColor(tr, tg, tb);
    let cy = 42;
    b.topCtas.slice(0, 5).forEach((cta) => {
      doc.text(`${cta.name} (${cta.count})`, x + 1, cy);
      cy += 6;
    });
  });

  // Platform distribution
  const platX = MARGIN + CW * 0.6;
  doc.setFontSize(10);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Piattaforme", "Platforms"), platX, 28);

  const palette = [
    theme.colors.primary,
    theme.colors.secondary,
    theme.colors.accent,
    "#8a6bb0",
    "#5ba09b",
  ];

  const platMap = new Map<string, number>();
  brands.forEach((b) => {
    b.platforms.forEach((p) => {
      platMap.set(p.name, (platMap.get(p.name) ?? 0) + p.count);
    });
  });
  const mergedPlats = [...platMap.entries()].sort((a, b) => b[1] - a[1]);

  drawProportionalBar(
    doc,
    mergedPlats.map((p, i) => ({
      name: p[0],
      value: p[1],
      color: palette[i % palette.length],
    })),
    platX,
    36,
    CW * 0.38,
    theme
  );
}

function addPdfComparisonLatestAds(
  doc: jsPDF,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text(label(locale, "Ultime Ads", "Latest Ads"), MARGIN, 18);

  const colW = (CW - (brands.length - 1) * 4) / brands.length;

  brands.forEach((b, i) => {
    const x = MARGIN + i * (colW + 4);

    // Brand header
    doc.setFillColor(pr, pg, pb);
    doc.rect(x, 25, colW, 7, "F");
    const [bgr, bgg, bgb] = hexToRgb(theme.colors.background);
    doc.setFontSize(8);
    doc.setTextColor(bgr, bgg, bgb);
    doc.text(b.name, x + 3, 30);

    let y = 36;
    b.latestAds.slice(0, 4).forEach((ad) => {
      const headline = ad.headline ?? `Ad #${ad.ad_archive_id.slice(0, 10)}`;

      doc.setFillColor(26, 26, 26);
      doc.roundedRect(x, y, colW, 28, 1, 1, "F");

      // Accent top line
      doc.setFillColor(pr, pg, pb);
      doc.rect(x, y, colW, 1, "F");

      doc.setFontSize(7);
      doc.setTextColor(tr, tg, tb);
      doc.text(headline, x + 3, y + 8, { maxWidth: colW - 6 });

      doc.setFontSize(5);
      doc.text(`ID: ${ad.ad_archive_id.slice(0, 16)}\u2026`, x + 3, y + 24);

      y += 32;
    });
  });
}

// ─── Benchmark PDF page ─────────────────────────────────────────

function addPdfBenchmarkPage(
  doc: jsPDF,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  doc.addPage();
  fillBg(doc, theme);

  const [pr, pg, pb] = hexToRgb(theme.colors.primary);
  const [tr, tg, tb] = hexToRgb(theme.colors.text);

  doc.setFontSize(18);
  doc.setTextColor(pr, pg, pb);
  doc.text("Benchmark", MARGIN, 18);

  const colW = CW / (brands.length + 1);
  let y = 30;

  // Header
  doc.setFillColor(pr, pg, pb);
  doc.rect(MARGIN, y - 5, CW, 8, "F");
  const [bgr, bgg, bgb] = hexToRgb(theme.colors.background);
  doc.setFontSize(8);
  doc.setTextColor(bgr, bgg, bgb);
  doc.text("KPI", MARGIN + 2, y);
  brands.forEach((b, i) => {
    doc.text(b.name, MARGIN + colW * (i + 1), y, { maxWidth: colW - 4 });
  });

  y += 8;

  const total = (b: BrandData) => b.imageCount + b.videoCount + b.carouselCount;
  const fmtMix = (b: BrandData) => {
    const t = total(b);
    if (t === 0) return "\u2014";
    const imgPct = Math.round((b.imageCount / t) * 100);
    const vidPct = Math.round((b.videoCount / t) * 100);
    return `${imgPct}% Img / ${vidPct}% Vid`;
  };

  const metrics: [string, (b: BrandData) => string][] = [
    [label(locale, "Ads totali", "Total ads"), (b) => String(b.totalAds)],
    [label(locale, "Ads attive", "Active ads"), (b) => String(b.activeAds)],
    [label(locale, "Durata media", "Avg. duration"), (b) => b.avgDuration > 0 ? `${b.avgDuration} ${label(locale, "gg", "d")}` : "\u2014"],
    [label(locale, "Lungh. media copy", "Avg. copy length"), (b) => b.avgCopyLength > 0 ? `${b.avgCopyLength} chr` : "\u2014"],
    [label(locale, "Refresh rate", "Refresh rate"), (b) => b.adsPerWeek > 0 ? `${b.adsPerWeek} ads/${label(locale, "sett", "wk")}` : "\u2014"],
    [label(locale, "Format mix", "Format mix"), fmtMix],
    [label(locale, "Top CTA", "Top CTA"), (b) => b.topCtas.length > 0 ? b.topCtas.slice(0, 3).map((c) => c.name).join(", ") : "\u2014"],
    [label(locale, "Piattaforme", "Platforms"), (b) => b.platforms.length > 0 ? b.platforms.map((p) => p.name).join(", ") : "\u2014"],
    [label(locale, "Obiettivo stimato", "Estimated objective"), (b) => b.objectiveInference.objective !== "unknown" ? `${b.objectiveInference.objective} (${b.objectiveInference.confidence}%)` : "\u2014"],
  ];

  metrics.forEach(([lbl, fn], idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(20, 20, 20);
      doc.rect(MARGIN, y - 3, CW, 10, "F");
    }

    doc.setFontSize(8);
    doc.setTextColor(tr, tg, tb);
    doc.text(lbl, MARGIN + 2, y + 3);

    doc.setTextColor(pr, pg, pb);
    brands.forEach((b, i) => {
      doc.text(fn(b), MARGIN + colW * (i + 1), y + 3);
    });

    y += 10;
  });
}

// ─── Main entry points ──────────────────────────────────────────

export async function generateSinglePdf(
  brand: BrandData,
  theme?: ThemeConfig | null,
  locale: Locale = "it",
  sections: SectionType[] = ["technical"],
  copyAnalysis?: CreativeAnalysisResult["copywriterReport"] | null,
  visualAnalysis?: CreativeAnalysisResult["creativeDirectorReport"] | null,
  // dateRange parameter kept for symmetry with generateSinglePptx —
  // the PDF currently does not render a date label, but accepting the
  // param means the caller can pass the same arguments to either
  // generator without conditional plumbing.
  _dateRange?: { from: string; to: string },
): Promise<ArrayBuffer> {
  const t = theme ?? DEFAULT_THEME;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const hasTechnical = sections.includes("technical");
  const hasCopy = sections.includes("copy");
  const hasVisual = sections.includes("visual");
  const hasBenchmark = sections.includes("benchmark");

  // Cover
  addPdfCoverPage(doc, brand, t, locale);

  // Dashboard (all metrics on one page)
  if (hasTechnical) {
    addPdfDashboardPage(doc, brand, t, locale);
  }

  // Latest Ads
  if (hasTechnical) {
    addPdfLatestAdsPage(doc, brand, t, locale);
  }

  // Benchmark
  if (hasBenchmark) {
    addPdfBenchmarkPage(doc, [brand], t, locale);
  }

  // Copy Analysis
  if (hasCopy && copyAnalysis?.brandAnalyses?.length) {
    addPdfCopyAnalysis(doc, copyAnalysis, t, locale);
  }

  // Visual Analysis
  if (hasVisual && visualAnalysis?.brandAnalyses?.length) {
    addPdfVisualAnalysis(doc, visualAnalysis, t, locale);
  }

  // Closing
  addPdfClosingPage(doc, t, locale);

  return doc.output("arraybuffer");
}

export async function generateComparisonPdf(
  brands: BrandData[],
  theme?: ThemeConfig | null,
  locale: Locale = "it",
  sections: SectionType[] = ["technical"],
  copyAnalysis?: CreativeAnalysisResult["copywriterReport"] | null,
  visualAnalysis?: CreativeAnalysisResult["creativeDirectorReport"] | null,
  _dateRange?: { from: string; to: string },
): Promise<ArrayBuffer> {
  const t = theme ?? DEFAULT_THEME;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const hasTechnical = sections.includes("technical");
  const hasCopy = sections.includes("copy");
  const hasVisual = sections.includes("visual");
  const hasBenchmark = sections.includes("benchmark");

  // Cover
  addPdfComparisonCover(doc, brands, t, locale);

  // Dashboard (overview + objectives + formats all on one page)
  if (hasTechnical) {
    addPdfComparisonDashboard(doc, brands, t, locale);
  }

  // CTA + Platforms
  if (hasTechnical) {
    addPdfComparisonCtaAndPlatforms(doc, brands, t, locale);
  }

  // Latest Ads
  if (hasTechnical) {
    addPdfComparisonLatestAds(doc, brands, t, locale);
  }

  // Benchmark
  if (hasBenchmark) {
    addPdfBenchmarkPage(doc, brands, t, locale);
  }

  // Copy Analysis
  if (hasCopy && copyAnalysis?.brandAnalyses?.length) {
    addPdfCopyAnalysis(doc, copyAnalysis, t, locale);
  }

  // Visual Analysis
  if (hasVisual && visualAnalysis?.brandAnalyses?.length) {
    addPdfVisualAnalysis(doc, visualAnalysis, t, locale);
  }

  // Closing
  addPdfClosingPage(doc, t, locale);

  return doc.output("arraybuffer");
}
