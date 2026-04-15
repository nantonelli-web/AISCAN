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
  lastScrapedAt: string | null;
  objectiveInference: {
    objective: string;
    confidence: number;
    signals: string[];
  };
  latestAds: {
    headline: string | null;
    image_url: string | null;
    ad_archive_id: string;
  }[];
}

export type SectionType = "technical" | "copy" | "visual";

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

/** Truncate text to max characters */
function trunc(text: string | null | undefined, max: number): string {
  if (!text) return "\u2014";
  return text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
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

function singleCover(
  pptx: PptxGenJS,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale
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

  slide.addText(formatDate(locale), {
    x: PAD,
    y: 3.3,
    w: SW - 2 * PAD,
    h: 0.35,
    fontSize: 11,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
    transparency: 40,
  });

  slide.addText("Powered by MAIT \u00B7 NIMA Digital", {
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
      catAxisLabelFontSize: 7,
      valAxisLabelColor: hex(theme.colors.text),
      valAxisLabelFontSize: 7,
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
      legendFontSize: 7,
      legendColor: hex(theme.colors.text),
      showPercent: true,
      dataLabelFontSize: 8,
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
    legendFontSize: 8,
    legendColor: hex(theme.colors.text),
    showPercent: true,
    dataLabelFontSize: 9,
    dataLabelColor: hex(theme.colors.text),
    chartColors: [
      hex(theme.colors.primary),
      hex(theme.colors.secondary),
      hex(theme.colors.accent),
    ],
  });
}

function singleLatestAds(
  pptx: PptxGenJS,
  brand: BrandData,
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(label(locale, "Ultime Ads", "Latest Ads"), {
    x: PAD,
    y: 0.15,
    w: SW - 2 * PAD,
    h: 0.4,
    fontSize: 14,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  const ads = brand.latestAds.slice(0, 6);
  if (ads.length === 0) {
    slide.addText(label(locale, "Nessuna ad recente", "No recent ads"), {
      x: PAD,
      y: 2.5,
      w: SW - 2 * PAD,
      h: 0.4,
      fontSize: 11,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      transparency: 40,
    });
    return;
  }

  const cols = 3;
  const cardW = (SW - 2 * PAD - 0.2 * (cols - 1)) / cols;
  const cardH = 1.8;
  const cardBg = lighten(contentBg(theme), 0.12);

  ads.forEach((ad, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (cardW + 0.2);
    const y = 0.7 + row * (cardH + 0.15);

    addCardBg(slide, pptx, x, y, cardW, cardH, cardBg);

    // Border line at top
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: cardW,
      h: 0.03,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });

    const headline = trunc(ad.headline, 80) || `Ad #${ad.ad_archive_id.slice(0, 10)}`;
    slide.addText(headline, {
      x: x + 0.1,
      y: y + 0.12,
      w: cardW - 0.2,
      h: 0.6,
      fontSize: 9,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      valign: "top",
    });

    slide.addText(`ID: ${ad.ad_archive_id.slice(0, 16)}\u2026`, {
      x: x + 0.1,
      y: y + cardH - 0.35,
      w: cardW - 0.2,
      h: 0.25,
      fontSize: 6,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      transparency: 50,
    });
  });
}

// ─── AI ANALYSIS SLIDES (shared for single and comparison) ──────

function addCopyAnalysisSlide(
  pptx: PptxGenJS,
  analyses: CopywriterBrandAnalysis[],
  comparison: string,
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(label(locale, "Analisi Copy (AI)", "Copy Analysis (AI)"), {
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
  const numBrands = analyses.length;
  const colW = (SW - 2 * PAD - 0.15 * (numBrands - 1)) / numBrands;

  analyses.forEach((a, i) => {
    const x = PAD + i * (colW + 0.15);
    const y = 0.6;
    const h = 3.8;

    addCardBg(slide, pptx, x, y, colW, h, cardBg);

    // Brand name header
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: colW,
      h: 0.28,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
    slide.addText(a.brandName, {
      x: x + 0.08,
      y,
      w: colW - 0.16,
      h: 0.28,
      fontSize: 9,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.background),
      bold: true,
    });

    const fields: [string, string][] = [
      [label(locale, "Tono di voce", "Tone of voice"), trunc(a.toneOfVoice, 80)],
      [label(locale, "Stile copy", "Copy style"), trunc(a.copyStyle, 80)],
      [label(locale, "Trigger emozionali", "Emotional triggers"), a.emotionalTriggers?.join(", ") ?? "\u2014"],
      [label(locale, "Pattern CTA", "CTA patterns"), trunc(a.ctaPatterns, 70)],
      [label(locale, "Punti di forza", "Strengths"), trunc(a.strengths, 70)],
      [label(locale, "Punti deboli", "Weaknesses"), trunc(a.weaknesses, 70)],
    ];

    let fy = y + 0.38;
    fields.forEach(([lbl, val]) => {
      slide.addText(lbl, {
        x: x + 0.08,
        y: fy,
        w: colW - 0.16,
        h: 0.18,
        fontSize: 6,
        fontFace: theme.fonts.heading,
        color: hex(theme.colors.primary),
        bold: true,
      });
      slide.addText(val, {
        x: x + 0.08,
        y: fy + 0.17,
        w: colW - 0.16,
        h: 0.38,
        fontSize: 7,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        valign: "top",
      });
      fy += 0.56;
    });
  });

  // Comparison box at bottom
  if (comparison) {
    slide.addShape(pptx.ShapeType.rect, {
      x: PAD,
      y: 4.5,
      w: SW - 2 * PAD,
      h: 0.03,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
    slide.addText(trunc(comparison, 200), {
      x: PAD + 0.05,
      y: 4.55,
      w: SW - 2 * PAD - 0.1,
      h: 0.9,
      fontSize: 7,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      transparency: 15,
      valign: "top",
    });
  }
}

function addVisualAnalysisSlide(
  pptx: PptxGenJS,
  analyses: CreativeDirectorBrandAnalysis[],
  comparison: string,
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(label(locale, "Analisi Creativa (AI)", "Creative Analysis (AI)"), {
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
  const numBrands = analyses.length;
  const colW = (SW - 2 * PAD - 0.15 * (numBrands - 1)) / numBrands;

  analyses.forEach((a, i) => {
    const x = PAD + i * (colW + 0.15);
    const y = 0.6;
    const h = 3.8;

    addCardBg(slide, pptx, x, y, colW, h, cardBg);

    // Brand name header
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: colW,
      h: 0.28,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
    slide.addText(a.brandName, {
      x: x + 0.08,
      y,
      w: colW - 0.16,
      h: 0.28,
      fontSize: 9,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.background),
      bold: true,
    });

    const fields: [string, string][] = [
      [label(locale, "Stile visivo", "Visual style"), trunc(a.visualStyle, 80)],
      [label(locale, "Palette colori", "Color palette"), trunc(a.colorPalette, 80)],
      [label(locale, "Stile fotografico", "Photography style"), trunc(a.photographyStyle, 80)],
      [label(locale, "Coerenza brand", "Brand consistency"), trunc(a.brandConsistency, 70)],
      [label(locale, "Preferenze formato", "Format preferences"), trunc(a.formatPreferences, 70)],
      [label(locale, "Punti di forza", "Strengths"), trunc(a.strengths, 70)],
      [label(locale, "Punti deboli", "Weaknesses"), trunc(a.weaknesses, 70)],
    ];

    let fy = y + 0.38;
    fields.forEach(([lbl, val]) => {
      slide.addText(lbl, {
        x: x + 0.08,
        y: fy,
        w: colW - 0.16,
        h: 0.16,
        fontSize: 6,
        fontFace: theme.fonts.heading,
        color: hex(theme.colors.primary),
        bold: true,
      });
      slide.addText(val, {
        x: x + 0.08,
        y: fy + 0.15,
        w: colW - 0.16,
        h: 0.32,
        fontSize: 7,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        valign: "top",
      });
      fy += 0.48;
    });
  });

  // Comparison box at bottom
  if (comparison) {
    slide.addShape(pptx.ShapeType.rect, {
      x: PAD,
      y: 4.5,
      w: SW - 2 * PAD,
      h: 0.03,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
    slide.addText(trunc(comparison, 200), {
      x: PAD + 0.05,
      y: 4.55,
      w: SW - 2 * PAD - 0.1,
      h: 0.9,
      fontSize: 7,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
      transparency: 15,
      valign: "top",
    });
  }
}

// ─── COMPARISON SLIDES ──────────────────────────────────────────

function compCover(
  pptx: PptxGenJS,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
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

  slide.addText(brands.map((b) => b.name).join(" vs "), {
    x: PAD,
    y: 1.8,
    w: SW - 2 * PAD,
    h: 1.0,
    fontSize: 30,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  slide.addText(
    label(locale, "Report Confronto", "Comparison Report"),
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

  slide.addText(formatDate(locale), {
    x: PAD,
    y: 3.3,
    w: SW - 2 * PAD,
    h: 0.35,
    fontSize: 11,
    fontFace: theme.fonts.body,
    color: hex(theme.colors.text),
    transparency: 40,
  });

  slide.addText("Powered by MAIT \u00B7 NIMA Digital", {
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
    h: 0.4,
    fontSize: 14,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  // Full-width comparison table
  const headerRow: PptxGenJS.TableRow = [
    {
      text: "",
      options: {
        fontSize: 9,
        fontFace: theme.fonts.heading,
        color: hex(theme.colors.text),
        fill: { color: hex(theme.colors.primary) },
        bold: true,
        border: { type: "none" as const },
      },
    },
    ...brands.map((b) => ({
      text: b.name,
      options: {
        fontSize: 9,
        fontFace: theme.fonts.heading,
        color: hex(theme.colors.background),
        fill: { color: hex(theme.colors.primary) },
        bold: true,
        align: "center" as const,
        border: { type: "none" as const },
      },
    })),
  ];

  const total = (b: BrandData) => b.imageCount + b.videoCount + b.carouselCount;
  const fmtMix = (b: BrandData) => {
    const t = total(b);
    if (t === 0) return "\u2014";
    return `${Math.round((b.imageCount / t) * 100)}% Img, ${Math.round((b.videoCount / t) * 100)}% Vid, ${Math.round((b.carouselCount / t) * 100)}% Car`;
  };

  const metrics: [string, (b: BrandData) => string][] = [
    [label(locale, "Ads totali", "Total ads"), (b) => String(b.totalAds)],
    [label(locale, "Ads attive", "Active ads"), (b) => String(b.activeAds)],
    [label(locale, "Durata media", "Avg. duration"), (b) => b.avgDuration > 0 ? `${b.avgDuration} ${label(locale, "gg", "d")}` : "\u2014"],
    [label(locale, "Lungh. copy", "Copy length"), (b) => b.avgCopyLength > 0 ? `${b.avgCopyLength} ${label(locale, "chr", "chr")}` : "\u2014"],
    [label(locale, "Refresh rate", "Refresh rate"), (b) => b.adsPerWeek > 0 ? `${b.adsPerWeek}/wk` : "\u2014"],
    [label(locale, "Format mix", "Format mix"), fmtMix],
  ];

  const altBg = lighten(contentBg(theme), 0.08);

  const dataRows: PptxGenJS.TableRow[] = metrics.map(([lbl, fn], idx) => [
    {
      text: lbl,
      options: {
        fontSize: 9,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        fill: { color: idx % 2 === 0 ? hex(theme.colors.background) : altBg },
        border: { type: "none" as const },
        bold: true,
      },
    },
    ...brands.map((b) => ({
      text: fn(b),
      options: {
        fontSize: 9,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.primary),
        fill: { color: idx % 2 === 0 ? hex(theme.colors.background) : altBg },
        align: "center" as const,
        border: { type: "none" as const },
        bold: true,
      },
    })),
  ]);

  const labelColW = 2.5;
  const dataColW = (SW - 2 * PAD - labelColW) / brands.length;
  const colWidths = [labelColW, ...brands.map(() => dataColW)];

  slide.addTable([headerRow, ...dataRows], {
    x: PAD,
    y: 0.65,
    w: SW - 2 * PAD,
    colW: colWidths,
    rowH: 0.4,
  });
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

  // TOP HALF: Objectives side by side
  const topH = 2.2;
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

    slide.addText(obj.objective.replace(/_/g, " ").toUpperCase(), {
      x: x + 0.08,
      y: y + 0.35,
      w: colW - 0.16,
      h: 0.3,
      fontSize: 12,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.text),
      bold: true,
    });

    // Confidence bar
    const barW = colW - 0.4;
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.08,
      y: y + 0.7,
      w: barW,
      h: 0.14,
      fill: { color: "333333" },
      line: { type: "none" },
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.08,
      y: y + 0.7,
      w: Math.max(barW * (obj.confidence / 100), 0.02),
      h: 0.14,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
    slide.addText(`${obj.confidence}%`, {
      x: x + 0.08 + barW + 0.05,
      y: y + 0.65,
      w: 0.3,
      h: 0.2,
      fontSize: 7,
      fontFace: theme.fonts.body,
      color: hex(theme.colors.text),
    });

    // Top 3 signals
    const sigs = obj.signals.slice(0, 3);
    sigs.forEach((s, j) => {
      slide.addText(`\u2022 ${s}`, {
        x: x + 0.08,
        y: y + 0.95 + j * 0.28,
        w: colW - 0.16,
        h: 0.25,
        fontSize: 7,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        transparency: 20,
      });
    });
  });

  // BOTTOM HALF: Format grouped bar chart
  const botY = topH + 0.8;
  const botH = SH - botY - 0.15;

  slide.addText(label(locale, "Distribuzione formati", "Format distribution"), {
    x: PAD,
    y: botY,
    w: SW - 2 * PAD,
    h: 0.25,
    fontSize: 9,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  slide.addChart(pptx.ChartType.bar, [
    { name: "Image", labels: brands.map((b) => b.name), values: brands.map((b) => b.imageCount) },
    { name: "Video", labels: brands.map((b) => b.name), values: brands.map((b) => b.videoCount) },
    { name: "Carousel", labels: brands.map((b) => b.name), values: brands.map((b) => b.carouselCount) },
  ], {
    x: PAD,
    y: botY + 0.3,
    w: SW - 2 * PAD,
    h: botH - 0.35,
    barDir: "col",
    barGrouping: "clustered",
    showLegend: true,
    legendPos: "b",
    legendFontSize: 7,
    legendColor: hex(theme.colors.text),
    catAxisLabelColor: hex(theme.colors.text),
    catAxisLabelFontSize: 8,
    valAxisLabelColor: hex(theme.colors.text),
    valAxisLabelFontSize: 7,
    chartColors: [
      hex(theme.colors.primary),
      hex(theme.colors.secondary),
      hex(theme.colors.accent),
    ],
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

  // RIGHT: Platform distribution
  slide.addText(label(locale, "Piattaforme", "Platforms"), {
    x: rightX,
    y: 0.6,
    w: rightW,
    h: 0.25,
    fontSize: 9,
    fontFace: theme.fonts.heading,
    color: hex(theme.colors.primary),
    bold: true,
  });

  // Merge platform data across brands
  const platMap = new Map<string, number>();
  brands.forEach((b) => {
    b.platforms.forEach((p) => {
      platMap.set(p.name, (platMap.get(p.name) ?? 0) + p.count);
    });
  });
  const mergedPlats = [...platMap.entries()].sort((a, b) => b[1] - a[1]);

  if (mergedPlats.length > 0) {
    const palette = [
      hex(theme.colors.primary),
      hex(theme.colors.secondary),
      hex(theme.colors.accent),
      "8a6bb0",
      "5ba09b",
    ];
    slide.addChart(pptx.ChartType.doughnut, [
      { name: "Platforms", labels: mergedPlats.map((p) => p[0]), values: mergedPlats.map((p) => p[1]) },
    ], {
      x: rightX,
      y: 0.95,
      w: rightW,
      h: SH - 1.2,
      showLegend: true,
      legendPos: "b",
      legendFontSize: 7,
      legendColor: hex(theme.colors.text),
      showPercent: true,
      dataLabelFontSize: 8,
      dataLabelColor: hex(theme.colors.text),
      chartColors: palette.slice(0, mergedPlats.length),
    });
  }
}

function compLatestAds(
  pptx: PptxGenJS,
  brands: BrandData[],
  theme: ThemeConfig,
  locale: Locale
) {
  const slide = pptx.addSlide();
  addLogo(slide, theme);
  slide.background = { color: hex(contentBg(theme)) };

  slide.addText(label(locale, "Ultime Ads", "Latest Ads"), {
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
  const colW = (SW - 2 * PAD - 0.15 * (brands.length - 1)) / brands.length;

  brands.forEach((b, i) => {
    const x = PAD + i * (colW + 0.15);

    // Brand name header
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: 0.6,
      w: colW,
      h: 0.25,
      fill: { color: hex(theme.colors.primary) },
      line: { type: "none" },
    });
    slide.addText(b.name, {
      x: x + 0.08,
      y: 0.6,
      w: colW - 0.16,
      h: 0.25,
      fontSize: 8,
      fontFace: theme.fonts.heading,
      color: hex(theme.colors.background),
      bold: true,
    });

    const ads = b.latestAds.slice(0, 4);
    ads.forEach((ad, j) => {
      const cy = 0.95 + j * 1.05;
      const headline = trunc(ad.headline, 80) || `Ad #${ad.ad_archive_id.slice(0, 10)}`;

      addCardBg(slide, pptx, x, cy, colW, 0.9, cardBg);

      slide.addText(headline, {
        x: x + 0.08,
        y: cy + 0.05,
        w: colW - 0.16,
        h: 0.5,
        fontSize: 7,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        valign: "top",
      });

      slide.addText(`ID: ${ad.ad_archive_id.slice(0, 14)}\u2026`, {
        x: x + 0.08,
        y: cy + 0.6,
        w: colW - 0.16,
        h: 0.2,
        fontSize: 5,
        fontFace: theme.fonts.body,
        color: hex(theme.colors.text),
        transparency: 50,
      });
    });
  });
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

  slide.addText("Powered by MAIT \u00B7 NIMA Digital", {
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

// ─── Main entry points ──────────────────────────────────────────

export async function generateSinglePptx(
  brand: BrandData,
  theme?: ThemeConfig | null,
  locale: Locale = "it",
  sections: SectionType[] = ["technical"],
  copyAnalysis?: CreativeAnalysisResult["copywriterReport"] | null,
  visualAnalysis?: CreativeAnalysisResult["creativeDirectorReport"] | null
): Promise<Buffer> {
  const t = theme ?? DEFAULT_THEME;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "CUSTOM", width: SW, height: SH });
  pptx.layout = "CUSTOM";
  pptx.author = "MAIT \u00B7 NIMA Digital";
  pptx.title = `${brand.name} \u2014 Report`;

  const hasTechnical = sections.includes("technical");
  const hasCopy = sections.includes("copy");
  const hasVisual = sections.includes("visual");

  // Slide 1: Cover
  singleCover(pptx, brand, t, locale);

  // Slide 2: Full Dashboard (technical)
  if (hasTechnical) {
    singleDashboard(pptx, brand, t, locale);
  }

  // Slide 3: Objective + Format pie (technical)
  if (hasTechnical) {
    singleObjectiveAndFormat(pptx, brand, t, locale);
  }

  // Slide 4: Latest Ads (technical)
  if (hasTechnical) {
    singleLatestAds(pptx, brand, t, locale);
  }

  // Slide 5: Copy Analysis (if selected and data available)
  if (hasCopy && copyAnalysis?.brandAnalyses?.length) {
    addCopyAnalysisSlide(
      pptx,
      copyAnalysis.brandAnalyses,
      copyAnalysis.comparison ?? "",
      t,
      locale
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
  visualAnalysis?: CreativeAnalysisResult["creativeDirectorReport"] | null
): Promise<Buffer> {
  const t = theme ?? DEFAULT_THEME;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "CUSTOM", width: SW, height: SH });
  pptx.layout = "CUSTOM";
  pptx.author = "MAIT \u00B7 NIMA Digital";
  pptx.title = `${brands.map((b) => b.name).join(" vs ")} \u2014 Comparison Report`;

  const hasTechnical = sections.includes("technical");
  const hasCopy = sections.includes("copy");
  const hasVisual = sections.includes("visual");

  // Slide 1: Cover
  compCover(pptx, brands, t, locale);

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

  // Slide 5: Latest Ads
  if (hasTechnical) {
    compLatestAds(pptx, brands, t, locale);
  }

  // Slide 6: Copy Analysis
  if (hasCopy && copyAnalysis?.brandAnalyses?.length) {
    addCopyAnalysisSlide(
      pptx,
      copyAnalysis.brandAnalyses,
      copyAnalysis.comparison ?? "",
      t,
      locale
    );
  }

  // Slide 7: Visual Analysis
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
