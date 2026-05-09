/**
 * PPTX export del dashboard Adv Performance.
 *
 * Costruisce un .pptx multi-slide con:
 * - cover (cliente / brand / channel / periodo)
 * - una slide per ogni sezione applicabile del dashboard
 *   (overview, purchases, engagement, time series, top campaigns,
 *    countries, campaign types, creatives, objective)
 *
 * Ogni slide rende il dato (chart o tabella nativi pptx) + il
 * testo dell'analisi AI quando salvata. Il testo AI conserva
 * paragrafi (\n\n), bold (**...**) e liste ("- "). Le slide sono
 * native PowerPoint (editabili dall'utente in Keynote /
 * PowerPoint / Google Slides).
 *
 * Lib: pptxgenjs (~200KB, server-side, no deps esterne).
 *
 * Layout: 16:9 widescreen 13.333" x 7.5" (default moderno
 * PowerPoint). Tutte le posizioni si riferiscono a questa area.
 */

import PptxGenJS from "pptxgenjs";
import type { PerfDashboardData } from "@/types/perf";

interface AnalysisRow {
  section: string;
  content: string;
  edited_by_user: boolean;
}

interface BuildOptions {
  data: PerfDashboardData;
  analyses: AnalysisRow[];
  clientName: string;
  brandName: string;
  channel: "meta" | "snapchat" | "google" | "tiktok";
}

/* ─── Layout geometry ──────────────────────────────────── */

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.5;
const INNER_W = SLIDE_W - 2 * MARGIN; // 12.333
const HEADER_TOP = 0.3;
const TITLE_TOP = 0.65;
const DIVIDER_Y = 1.25;
const CONTENT_TOP = 1.5;
const CONTENT_BOTTOM = 7.2;

const COLORS = {
  gold: "D9A82F",
  blue: "5B7EA3",
  green: "6B8E6B",
  orange: "D97757",
  purple: "8A6BB0",
  rose: "E11D48",
  amber: "F59E0B",
  text: "1F2937",
  muted: "6B7280",
  border: "E5E7EB",
  bgLight: "F9FAFB",
  white: "FFFFFF",
  violet: "8B5CF6",
} as const;

const CHANNEL_LABEL: Record<string, { name: string; color: string }> = {
  meta: { name: "Meta", color: "0866FF" },
  snapchat: { name: "Snapchat", color: "EAB308" },
  google: { name: "Google Ads", color: "1A73E8" },
  tiktok: { name: "TikTok Ads", color: "E11D48" },
};

const PIE_PALETTE = [
  COLORS.gold,
  COLORS.blue,
  COLORS.green,
  COLORS.orange,
  COLORS.purple,
  COLORS.muted,
];

/* ─── Helpers ──────────────────────────────────────────── */

function fmtNum(n: number | null | undefined, opts?: { decimals?: number }): string {
  if (n == null) return "—";
  const d = opts?.decimals ?? 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
}

function fmtMoney(n: number | null | undefined, currency: string | null): string {
  if (n == null) return "—";
  const v = fmtNum(n, { decimals: 2 });
  return currency ? `${v} ${currency}` : v;
}

function inlineRuns(text: string): { text: string; options?: { bold?: boolean } }[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  return parts.map((p) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return { text: p.slice(2, -2), options: { bold: true } };
    }
    return { text: p };
  });
}

function buildTextRuns(content: string) {
  const blocks = content.trim().split(/\n{2,}/);
  const out: PptxGenJS.TextProps[] = [];
  blocks.forEach((block, idx) => {
    const lines = block.split(/\n/);
    const isList = lines.every((l) => l.trim().startsWith("- "));
    if (isList && lines.length >= 2) {
      lines.forEach((line) => {
        const text = line.replace(/^-\s+/, "");
        const runs = inlineRuns(text);
        runs.forEach((r, rIdx) => {
          out.push({
            text: r.text,
            options: {
              bullet: rIdx === 0 ? { type: "bullet" } : false,
              bold: r.options?.bold,
              breakLine: rIdx === runs.length - 1,
            },
          });
        });
      });
    } else {
      lines.forEach((line, lineIdx) => {
        const runs = inlineRuns(line);
        runs.forEach((r, rIdx) => {
          out.push({
            text: r.text,
            options: {
              bold: r.options?.bold,
              breakLine:
                rIdx === runs.length - 1 && lineIdx === lines.length - 1,
            },
          });
        });
      });
    }
    if (idx < blocks.length - 1) {
      out.push({ text: "", options: { breakLine: true } });
    }
  });
  return out;
}

function findAnalysis(
  analyses: AnalysisRow[],
  section: string,
): AnalysisRow | null {
  return analyses.find((a) => a.section === section) ?? null;
}

/* ─── Slide builders ───────────────────────────────────── */

interface BuildContext {
  pres: PptxGenJS;
  o: BuildOptions;
}

function addHeader(slide: PptxGenJS.Slide, ctx: BuildContext, title: string) {
  const ch = CHANNEL_LABEL[ctx.o.channel] ?? CHANNEL_LABEL.meta;

  // Eyebrow: cliente · brand (top-left)
  slide.addText(
    [
      {
        text: ctx.o.clientName,
        options: { bold: true, color: COLORS.text },
      },
      { text: " · ", options: { color: COLORS.muted } },
      { text: ctx.o.brandName, options: { color: COLORS.text } },
    ],
    {
      x: MARGIN,
      y: HEADER_TOP,
      w: 8,
      h: 0.3,
      fontSize: 10,
      fontFace: "Calibri",
    },
  );

  // Channel pill (top-right)
  const pillW = 1.6;
  slide.addText(ch.name, {
    x: SLIDE_W - MARGIN - pillW,
    y: HEADER_TOP - 0.03,
    w: pillW,
    h: 0.36,
    fontSize: 11,
    fontFace: "Calibri",
    bold: true,
    color: ch.color,
    align: "center",
    valign: "middle",
    fill: { color: ch.color, transparency: 88 },
    rectRadius: 0.05,
  });

  // Title
  slide.addText(title.toUpperCase(), {
    x: MARGIN,
    y: TITLE_TOP,
    w: INNER_W,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: COLORS.text,
    fontFace: "Calibri",
    charSpacing: 30,
  });

  // Divider
  slide.addShape("rect" as never, {
    x: MARGIN,
    y: DIVIDER_Y,
    w: INNER_W,
    h: 0.02,
    fill: { color: COLORS.border },
    line: { color: COLORS.border, width: 0 },
  });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function addAnalysisBox(
  slide: PptxGenJS.Slide,
  analysis: AnalysisRow | null,
  area: Box,
) {
  if (!analysis || !analysis.content) return;

  // Background sottile violet per delimitare l'analisi.
  slide.addShape("roundRect" as never, {
    x: area.x,
    y: area.y,
    w: area.w,
    h: area.h,
    rectRadius: 0.06,
    fill: { color: COLORS.violet, transparency: 95 },
    line: { color: COLORS.violet, width: 0.5, transparency: 70 },
  });

  // Etichetta
  slide.addText("ANALISI AI", {
    x: area.x + 0.18,
    y: area.y + 0.1,
    w: 2,
    h: 0.25,
    fontSize: 8,
    bold: true,
    color: COLORS.violet,
    fontFace: "Calibri",
    charSpacing: 80,
  });

  // Body
  slide.addText(buildTextRuns(analysis.content), {
    x: area.x + 0.18,
    y: area.y + 0.42,
    w: area.w - 0.36,
    h: area.h - 0.55,
    fontSize: 10,
    fontFace: "Calibri",
    color: COLORS.text,
    valign: "top",
    paraSpaceAfter: 4,
  });
}

/* ─── Cover slide ──────────────────────────────────────── */

function buildCover(ctx: BuildContext) {
  const slide = ctx.pres.addSlide();
  slide.background = { color: COLORS.white };
  const ch = CHANNEL_LABEL[ctx.o.channel] ?? CHANNEL_LABEL.meta;

  // Top accent bar
  slide.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.18,
    fill: { color: COLORS.gold },
    line: { color: COLORS.gold, width: 0 },
  });

  slide.addText("ADV PERFORMANCE REPORT", {
    x: 0.8,
    y: 1.4,
    w: SLIDE_W - 1.6,
    h: 0.5,
    fontSize: 14,
    bold: true,
    color: COLORS.muted,
    fontFace: "Calibri",
    charSpacing: 100,
  });
  slide.addText(ctx.o.brandName, {
    x: 0.8,
    y: 2.0,
    w: SLIDE_W - 1.6,
    h: 1.4,
    fontSize: 56,
    bold: true,
    color: COLORS.text,
    fontFace: "Calibri",
  });
  slide.addText(ctx.o.clientName, {
    x: 0.8,
    y: 3.5,
    w: SLIDE_W - 1.6,
    h: 0.5,
    fontSize: 22,
    color: COLORS.muted,
    fontFace: "Calibri",
  });

  // Two info boxes side-by-side (channel + period)
  const boxW = 5.5;
  const boxH = 1.5;
  const boxY = 4.6;
  const gap = 0.5;
  const totalW = 2 * boxW + gap;
  const startX = (SLIDE_W - totalW) / 2;

  // Channel box
  slide.addShape("roundRect" as never, {
    x: startX,
    y: boxY,
    w: boxW,
    h: boxH,
    rectRadius: 0.1,
    fill: { color: ch.color, transparency: 92 },
    line: { color: ch.color, width: 0.7, transparency: 75 },
  });
  slide.addText("CANALE", {
    x: startX + 0.3,
    y: boxY + 0.2,
    w: boxW - 0.6,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: COLORS.muted,
    fontFace: "Calibri",
    charSpacing: 100,
  });
  slide.addText(ch.name, {
    x: startX + 0.3,
    y: boxY + 0.55,
    w: boxW - 0.6,
    h: 0.7,
    fontSize: 28,
    bold: true,
    color: ch.color,
    fontFace: "Calibri",
  });

  // Period box
  const periodX = startX + boxW + gap;
  slide.addShape("roundRect" as never, {
    x: periodX,
    y: boxY,
    w: boxW,
    h: boxH,
    rectRadius: 0.1,
    fill: { color: COLORS.gold, transparency: 92 },
    line: { color: COLORS.gold, width: 0.7, transparency: 75 },
  });
  slide.addText("PERIODO", {
    x: periodX + 0.3,
    y: boxY + 0.2,
    w: boxW - 0.6,
    h: 0.3,
    fontSize: 9,
    bold: true,
    color: COLORS.muted,
    fontFace: "Calibri",
    charSpacing: 100,
  });
  slide.addText(`${ctx.o.data.periodFrom} → ${ctx.o.data.periodTo}`, {
    x: periodX + 0.3,
    y: boxY + 0.55,
    w: boxW - 0.6,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: COLORS.text,
    fontFace: "Calibri",
  });
  if (ctx.o.data.currency) {
    slide.addText(`Valuta: ${ctx.o.data.currency}`, {
      x: periodX + 0.3,
      y: boxY + 1.05,
      w: boxW - 0.6,
      h: 0.3,
      fontSize: 12,
      color: COLORS.muted,
      fontFace: "Calibri",
    });
  }

  // Footer
  slide.addText("Generato da AISCAN", {
    x: 0.8,
    y: SLIDE_H - 0.5,
    w: SLIDE_W - 1.6,
    h: 0.3,
    fontSize: 10,
    color: COLORS.muted,
    fontFace: "Calibri",
    align: "center",
  });
}

/* ─── KPI grid (overview) ─────────────────────────────── */

interface KpiCard {
  label: string;
  value: string;
  color: string;
}

function addKpiGrid(slide: PptxGenJS.Slide, cards: KpiCard[], area: Box) {
  const cols = cards.length <= 3 ? cards.length : 4;
  const rows = Math.ceil(cards.length / cols);
  const gap = 0.18;
  const cardW = (area.w - gap * (cols - 1)) / cols;
  const cardH = (area.h - gap * (rows - 1)) / rows;

  cards.forEach((c, i) => {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const x = area.x + col * (cardW + gap);
    const y = area.y + r * (cardH + gap);

    slide.addShape("roundRect" as never, {
      x,
      y,
      w: cardW,
      h: cardH,
      rectRadius: 0.08,
      fill: { color: c.color, transparency: 92 },
      line: { color: c.color, width: 0.6, transparency: 75 },
    });
    slide.addText(c.label.toUpperCase(), {
      x: x + 0.18,
      y: y + 0.15,
      w: cardW - 0.36,
      h: 0.28,
      fontSize: 9,
      bold: true,
      color: COLORS.muted,
      fontFace: "Calibri",
      charSpacing: 80,
    });
    slide.addText(c.value, {
      x: x + 0.18,
      y: y + 0.46,
      w: cardW - 0.36,
      h: cardH - 0.6,
      fontSize: 22,
      bold: true,
      color: COLORS.text,
      fontFace: "Calibri",
      valign: "middle",
    });
  });
}

function buildOverview(ctx: BuildContext) {
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Panoramica metriche");
  const k = ctx.o.data.current;
  const cur = ctx.o.data.currency;
  const cards: KpiCard[] = [
    { label: "Spesa", value: fmtMoney(k.amountSpent, cur), color: COLORS.gold },
    { label: "Impressioni", value: fmtNum(k.impressions), color: COLORS.blue },
    { label: "Click", value: fmtNum(k.effectiveClicks), color: COLORS.blue },
    { label: "Reach", value: fmtNum(k.reach), color: COLORS.purple },
    {
      label: "CTR",
      value:
        k.effectiveCtr != null
          ? `${fmtNum(k.effectiveCtr, { decimals: 2 })}%`
          : "—",
      color: COLORS.green,
    },
    { label: "CPM", value: fmtMoney(k.cpm, cur), color: COLORS.amber },
    { label: "CPC", value: fmtMoney(k.effectiveCpc, cur), color: COLORS.amber },
    {
      label: "Frequenza",
      value: fmtNum(k.frequency, { decimals: 2 }),
      color: COLORS.purple,
    },
  ];

  // KPI grid in alto (2 righe x 4 colonne, ~2.6" altezza totale)
  const kpiArea: Box = {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: 2.6,
  };
  addKpiGrid(slide, cards, kpiArea);

  // Analysis sotto
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "overview"), {
    x: MARGIN,
    y: kpiArea.y + kpiArea.h + 0.25,
    w: INNER_W,
    h: CONTENT_BOTTOM - (kpiArea.y + kpiArea.h + 0.25),
  });
}

function buildPurchases(ctx: BuildContext) {
  const k = ctx.o.data.current;
  if (k.purchases <= 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Acquisti & ROI");
  const cur = ctx.o.data.currency;
  const cards: KpiCard[] = [
    { label: "Acquisti", value: fmtNum(k.purchases), color: COLORS.green },
    {
      label: "Costo per acquisto",
      value: fmtMoney(k.costPerPurchase, cur),
      color: COLORS.amber,
    },
    {
      label: "ROAS",
      value: fmtNum(k.roas ?? 0, { decimals: 2 }),
      color: COLORS.green,
    },
  ];
  const kpiArea: Box = {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: 1.4,
  };
  addKpiGrid(slide, cards, kpiArea);
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "purchases"), {
    x: MARGIN,
    y: kpiArea.y + kpiArea.h + 0.3,
    w: INNER_W,
    h: CONTENT_BOTTOM - (kpiArea.y + kpiArea.h + 0.3),
  });
}

function buildEngagement(ctx: BuildContext) {
  const k = ctx.o.data.current;
  if (
    k.postEngagements <= 0 &&
    k.instagramProfileVisits <= 0 &&
    k.instagramFollows <= 0
  ) {
    return;
  }
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Engagement & Social");
  const cards: KpiCard[] = [
    {
      label: "Post engagement",
      value: fmtNum(k.postEngagements),
      color: COLORS.rose,
    },
    {
      label: "Visite profilo IG",
      value: fmtNum(k.instagramProfileVisits),
      color: COLORS.purple,
    },
    {
      label: "Follow IG",
      value: fmtNum(k.instagramFollows),
      color: COLORS.rose,
    },
  ];
  const kpiArea: Box = {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: 1.4,
  };
  addKpiGrid(slide, cards, kpiArea);
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "engagement"), {
    x: MARGIN,
    y: kpiArea.y + kpiArea.h + 0.3,
    w: INNER_W,
    h: CONTENT_BOTTOM - (kpiArea.y + kpiArea.h + 0.3),
  });
}

/* ─── Time series ─────────────────────────────────────── */

function buildTimeSeries(ctx: BuildContext) {
  if (ctx.o.data.timeSeries.length === 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Andamento giornaliero");
  const labels = ctx.o.data.timeSeries.map((p) => p.date);
  const spend = ctx.o.data.timeSeries.map((p) => p.spend);
  const imp = ctx.o.data.timeSeries.map((p) => p.impressions);

  // Combo chart: bar (spend) primary axis + line (impressions)
  // secondary axis. pptxgenjs ChartType.bar / .line / .line3D —
  // per il dual-axis usiamo ChartType.bar con un single series e
  // un secondo addChart line sotto. Cosi e' piu' leggibile e
  // garantisce che il rendering sia coerente in PowerPoint Web.
  slide.addChart(
    ctx.pres.ChartType.bar,
    [
      {
        name: `Spesa${ctx.o.data.currency ? ` (${ctx.o.data.currency})` : ""}`,
        labels,
        values: spend,
      },
    ],
    {
      x: MARGIN,
      y: CONTENT_TOP,
      w: INNER_W,
      h: 2.3,
      barDir: "col",
      chartColors: [COLORS.gold],
      catAxisLabelFontSize: 9,
      valAxisLabelFontSize: 9,
      showLegend: true,
      legendFontSize: 10,
      legendPos: "t",
      catAxisLabelRotate: -30,
    },
  );
  slide.addChart(
    ctx.pres.ChartType.line,
    [
      {
        name: "Impressioni",
        labels,
        values: imp,
      },
    ],
    {
      x: MARGIN,
      y: CONTENT_TOP + 2.4,
      w: INNER_W,
      h: 1.6,
      chartColors: [COLORS.blue],
      catAxisLabelFontSize: 8,
      valAxisLabelFontSize: 8,
      showLegend: true,
      legendFontSize: 9,
      legendPos: "t",
      lineSize: 2,
      catAxisLabelRotate: -30,
    },
  );
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "timeSeries"), {
    x: MARGIN,
    y: CONTENT_TOP + 4.1,
    w: INNER_W,
    h: CONTENT_BOTTOM - (CONTENT_TOP + 4.1),
  });
}

/** Helper: dato un nRows totali (inclusa header) e l'area
 *  disponibile, ritorna rowH/h tali che la tabella non
 *  overflowi mai. rowH e' clamped a [0.26, 0.42] per leggibilita'. */
function fitTable(
  nRows: number,
  maxAreaH: number,
): { rowH: number; tableH: number } {
  const rowH = Math.min(0.42, Math.max(0.26, maxAreaH / nRows));
  const tableH = rowH * nRows;
  return { rowH, tableH };
}

/* ─── Top campaigns ───────────────────────────────────── */

function buildTopCampaigns(ctx: BuildContext) {
  if (ctx.o.data.topByCampaignSpend.length === 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Top campagne");
  const cur = ctx.o.data.currency;
  // Limitiamo a 8 cosi' lasciamo spazio decente all'analisi sotto.
  const top = ctx.o.data.topByCampaignSpend.slice(0, 8);
  const nRows = top.length + 1; // + header
  // Area massima per la tabella (lascia min 2.0" all'analisi)
  const maxTableH = CONTENT_BOTTOM - CONTENT_TOP - 2.3; // ~3.4
  const { rowH, tableH } = fitTable(nRows, maxTableH);
  const tableRows: PptxGenJS.TableRow[] = [
    [
      { text: "CAMPAGNA", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
      { text: "SPESA", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
      { text: "IMPRESSIONI", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
      { text: "CLICK", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
      { text: "ROAS", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    ],
    ...top.map((c) => [
      { text: c.campaign_name, options: { fontSize: 10 } },
      { text: fmtMoney(c.spend, cur), options: { fontSize: 10, align: "right" as const } },
      { text: fmtNum(c.impressions), options: { fontSize: 10, align: "right" as const } },
      { text: fmtNum(c.clicks), options: { fontSize: 10, align: "right" as const } },
      {
        text: c.roas != null ? fmtNum(c.roas, { decimals: 2 }) : "—",
        options: { fontSize: 10, align: "right" as const },
      },
    ]),
  ];
  slide.addTable(tableRows, {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: tableH,
    colW: [INNER_W * 0.42, INNER_W * 0.16, INNER_W * 0.16, INNER_W * 0.13, INNER_W * 0.13],
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
    rowH,
  });

  const aY = CONTENT_TOP + tableH + 0.3;
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "topCampaigns"), {
    x: MARGIN,
    y: aY,
    w: INNER_W,
    h: CONTENT_BOTTOM - aY,
  });
}

/* ─── Country breakdown ───────────────────────────────── */

function buildCountries(ctx: BuildContext) {
  const cs = ctx.o.data.countries;
  if (cs.length === 0 || (cs.length === 1 && cs[0].code === "UNKNOWN")) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Distribuzione per paese");
  const cur = ctx.o.data.currency;
  const totalSpend = cs.reduce((s, c) => s + c.spend, 0);
  const showPurch = cs.some((c) => c.purchases > 0);

  const headerRow: PptxGenJS.TableCell[] = [
    { text: "PAESE", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "CAMPAGNE", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    { text: "SPESA", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    { text: "% SPESA", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    { text: "IMPRESSIONI", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    { text: "CLICK", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
  ];
  if (showPurch) {
    headerRow.push({
      text: "ACQUISTI",
      options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } },
    });
  }
  const rows: PptxGenJS.TableRow[] = [
    headerRow,
    ...cs.map((c) => {
      const pct = totalSpend > 0 ? (c.spend / totalSpend) * 100 : 0;
      const r: PptxGenJS.TableCell[] = [
        { text: `${c.code} · ${c.label}`, options: { fontSize: 10 } },
        { text: fmtNum(c.campaignCount), options: { fontSize: 10, align: "right" as const } },
        { text: fmtMoney(c.spend, cur), options: { fontSize: 10, align: "right" as const } },
        { text: `${fmtNum(pct, { decimals: 1 })}%`, options: { fontSize: 10, align: "right" as const } },
        { text: fmtNum(c.impressions), options: { fontSize: 10, align: "right" as const } },
        { text: fmtNum(c.clicks), options: { fontSize: 10, align: "right" as const } },
      ];
      if (showPurch) {
        r.push({
          text: fmtNum(c.purchases),
          options: { fontSize: 10, align: "right" as const, bold: c.purchases > 0 },
        });
      }
      return r;
    }),
  ];
  const { rowH, tableH } = fitTable(
    cs.length + 1,
    CONTENT_BOTTOM - CONTENT_TOP - 2.5,
  );
  slide.addTable(rows, {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: tableH,
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
    rowH,
  });
  const aY = CONTENT_TOP + tableH + 0.3;
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "countries"), {
    x: MARGIN,
    y: aY,
    w: INNER_W,
    h: CONTENT_BOTTOM - aY,
  });
}

/* ─── Campaign types ──────────────────────────────────── */

function buildCampaignTypes(ctx: BuildContext) {
  const ts = ctx.o.data.campaignTypes;
  if (ts.length === 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Tipologia campagna e risultati");
  const cur = ctx.o.data.currency;
  const showPurch = ts.some((b) => b.purchases > 0);
  const head: PptxGenJS.TableCell[] = [
    { text: "TIPO", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "CAMPAGNE", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    { text: "SPESA", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    { text: "RISULTATI", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    { text: "CPR", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
  ];
  if (showPurch) {
    head.push({
      text: "ACQUISTI",
      options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } },
    });
  }
  const tableRows: PptxGenJS.TableRow[] = [
    head,
    ...ts.map((b) => {
      const r: PptxGenJS.TableCell[] = [
        { text: `${b.code} · ${b.label}`, options: { fontSize: 10, bold: true } },
        { text: fmtNum(b.campaignCount), options: { fontSize: 10, align: "right" as const } },
        { text: fmtMoney(b.spend, cur), options: { fontSize: 10, align: "right" as const } },
        {
          text: b.resultCount > 0 ? fmtNum(b.resultCount) : "—",
          options: { fontSize: 10, align: "right" as const },
        },
        {
          text: b.cpr != null ? fmtMoney(b.cpr, cur) : "—",
          options: { fontSize: 10, align: "right" as const },
        },
      ];
      if (showPurch) {
        r.push({
          text: b.purchases > 0 ? fmtNum(b.purchases) : "—",
          options: { fontSize: 10, align: "right" as const, bold: b.purchases > 0 },
        });
      }
      return r;
    }),
  ];
  const { rowH, tableH } = fitTable(
    ts.length + 1,
    CONTENT_BOTTOM - CONTENT_TOP - 2.5,
  );
  slide.addTable(tableRows, {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: tableH,
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
    rowH,
  });
  const aY = CONTENT_TOP + tableH + 0.3;
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "campaignTypes"), {
    x: MARGIN,
    y: aY,
    w: INNER_W,
    h: CONTENT_BOTTOM - aY,
  });
}

/* ─── Creatives ───────────────────────────────────────── */

function buildCreatives(ctx: BuildContext) {
  const mix = ctx.o.data.creativeTypeMix;
  const counts = ctx.o.data.creativeCountByType;
  if (mix.length === 0 && counts.length === 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Distribuzione creativita'");

  const colW = (INNER_W - 0.4) / 2;
  const chartArea: Box = {
    x: MARGIN,
    y: CONTENT_TOP,
    w: colW,
    h: 3.5,
  };
  const tableArea: Box = {
    x: MARGIN + colW + 0.4,
    y: CONTENT_TOP,
    w: colW,
    h: 3.5,
  };

  if (mix.length > 0) {
    slide.addChart(
      ctx.pres.ChartType.pie,
      [
        {
          name: "Spesa per tipo",
          labels: mix.map((m) => m.name),
          values: mix.map((m) => m.value),
        },
      ],
      {
        x: chartArea.x,
        y: chartArea.y,
        w: chartArea.w,
        h: chartArea.h,
        chartColors: PIE_PALETTE,
        showLegend: true,
        legendFontSize: 10,
        legendPos: "b",
        showPercent: true,
        dataLabelFontSize: 9,
        dataLabelColor: COLORS.white,
      },
    );
  }

  if (counts.length > 0) {
    slide.addText(`Asset attivi / settimana (${ctx.o.data.creativeCountLabel})`, {
      x: tableArea.x,
      y: tableArea.y,
      w: tableArea.w,
      h: 0.35,
      fontSize: 11,
      bold: true,
      color: COLORS.text,
      fontFace: "Calibri",
    });
    const head: PptxGenJS.TableCell[] = [
      {
        text: "TIPO",
        options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } },
      },
      {
        text: "ASSET",
        options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } },
      },
    ];
    const rows: PptxGenJS.TableRow[] = [
      head,
      ...counts.map((c) => [
        { text: c.name, options: { fontSize: 11 } },
        {
          text: fmtNum(c.count, { decimals: 1 }),
          options: { fontSize: 12, align: "right" as const, bold: true },
        },
      ]),
    ];
    const cFit = fitTable(counts.length + 1, tableArea.h - 0.5);
    slide.addTable(rows, {
      x: tableArea.x,
      y: tableArea.y + 0.5,
      w: tableArea.w,
      h: cFit.tableH,
      colW: [tableArea.w * 0.6, tableArea.w * 0.4],
      border: { type: "solid", pt: 0.5, color: COLORS.border },
      fontFace: "Calibri",
      color: COLORS.text,
      rowH: cFit.rowH,
    });
  }

  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "creatives"), {
    x: MARGIN,
    y: CONTENT_TOP + 3.7,
    w: INNER_W,
    h: CONTENT_BOTTOM - (CONTENT_TOP + 3.7),
  });
}

/* ─── Objective mix ───────────────────────────────────── */

function buildObjective(ctx: BuildContext) {
  const om = ctx.o.data.objectiveMix;
  if (om.length === 0 || !om.some((o) => o.name && o.name !== "—")) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Distribuzione per obiettivo");
  const chartW = 7;
  slide.addChart(
    ctx.pres.ChartType.pie,
    [
      {
        name: "Spesa per obiettivo",
        labels: om.map((o) => o.name),
        values: om.map((o) => o.value),
      },
    ],
    {
      x: (SLIDE_W - chartW) / 2,
      y: CONTENT_TOP,
      w: chartW,
      h: 3.5,
      chartColors: PIE_PALETTE,
      showLegend: true,
      legendFontSize: 11,
      legendPos: "r",
      showPercent: true,
      dataLabelFontSize: 10,
      dataLabelColor: COLORS.white,
    },
  );
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "objective"), {
    x: MARGIN,
    y: CONTENT_TOP + 3.7,
    w: INNER_W,
    h: CONTENT_BOTTOM - (CONTENT_TOP + 3.7),
  });
}

/* ─── Public API ─────────────────────────────────────── */

export async function buildPerfPptx(opts: BuildOptions): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.title = `${opts.brandName} — Adv Performance`;
  pres.author = "AISCAN";
  pres.company = opts.clientName;

  // Layout 16:9 widescreen — formato standard moderno PowerPoint.
  pres.defineLayout({
    name: "AISCAN_WIDESCREEN",
    width: SLIDE_W,
    height: SLIDE_H,
  });
  pres.layout = "AISCAN_WIDESCREEN";

  const ctx: BuildContext = { pres, o: opts };

  buildCover(ctx);
  buildOverview(ctx);
  buildPurchases(ctx);
  buildEngagement(ctx);
  buildTimeSeries(ctx);
  buildTopCampaigns(ctx);
  buildCountries(ctx);
  buildCampaignTypes(ctx);
  buildCreatives(ctx);
  buildObjective(ctx);

  const buf = (await pres.write({
    outputType: "nodebuffer",
  })) as Buffer;
  return buf;
}
