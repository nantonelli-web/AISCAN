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
  /** Channel canonical key per il pill colorato. */
  channel: "meta" | "snapchat" | "google" | "tiktok";
}

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

/** Trasforma un paragrafo con **bold** in array di runs pptx. */
function inlineRuns(text: string): { text: string; options?: { bold?: boolean } }[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  return parts.map((p) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return { text: p.slice(2, -2), options: { bold: true } };
    }
    return { text: p };
  });
}

/** Trasforma il content del modello in array di "blocchi" pptx
 *  testuali, con runs per il bold + bullet per le liste. */
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
      // Paragraph break
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
  slide.addText(
    [
      {
        text: ctx.o.clientName,
        options: { bold: true, color: COLORS.text },
      },
      {
        text: " · ",
        options: { color: COLORS.muted },
      },
      {
        text: ctx.o.brandName,
        options: { color: COLORS.text },
      },
    ],
    {
      x: 0.4,
      y: 0.25,
      w: 6,
      h: 0.3,
      fontSize: 10,
      fontFace: "Calibri",
    },
  );
  slide.addText(ch.name, {
    x: 8.5,
    y: 0.2,
    w: 1.2,
    h: 0.35,
    fontSize: 10,
    fontFace: "Calibri",
    bold: true,
    color: ch.color,
    align: "center",
    valign: "middle",
    fill: { color: ch.color, transparency: 90 },
  });
  slide.addText(title.toUpperCase(), {
    x: 0.4,
    y: 0.6,
    w: 9.2,
    h: 0.5,
    fontSize: 18,
    bold: true,
    color: COLORS.text,
    fontFace: "Calibri",
  });
  // Bottom divider
  slide.addShape("rect" as never, {
    x: 0.4,
    y: 1.15,
    w: 9.2,
    h: 0.02,
    fill: { color: COLORS.border },
    line: { color: COLORS.border, width: 0 },
  });
}

function addAnalysisBox(
  slide: PptxGenJS.Slide,
  analysis: AnalysisRow | null,
  area: { x: number; y: number; w: number; h: number },
) {
  if (!analysis || !analysis.content) return;
  // Etichetta "ANALISI AI"
  slide.addText("ANALISI AI", {
    x: area.x,
    y: area.y,
    w: 2,
    h: 0.25,
    fontSize: 8,
    bold: true,
    color: "8A6BB0",
    fontFace: "Calibri",
    charSpacing: 50,
  });
  slide.addText(buildTextRuns(analysis.content), {
    x: area.x,
    y: area.y + 0.3,
    w: area.w,
    h: area.h - 0.3,
    fontSize: 10,
    fontFace: "Calibri",
    color: COLORS.text,
    valign: "top",
    paraSpaceAfter: 4,
  });
}

function buildCover(ctx: BuildContext) {
  const slide = ctx.pres.addSlide();
  slide.background = { color: COLORS.white };
  const ch = CHANNEL_LABEL[ctx.o.channel] ?? CHANNEL_LABEL.meta;
  // Top-left brand mark (gradient bar)
  slide.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.15,
    fill: { color: COLORS.gold },
    line: { color: COLORS.gold, width: 0 },
  });
  slide.addText("ADV PERFORMANCE REPORT", {
    x: 0.6,
    y: 1.2,
    w: 8.8,
    h: 0.4,
    fontSize: 12,
    bold: true,
    color: COLORS.muted,
    fontFace: "Calibri",
    charSpacing: 80,
  });
  slide.addText(ctx.o.brandName, {
    x: 0.6,
    y: 1.7,
    w: 8.8,
    h: 1.2,
    fontSize: 44,
    bold: true,
    color: COLORS.text,
    fontFace: "Calibri",
  });
  slide.addText(ctx.o.clientName, {
    x: 0.6,
    y: 2.95,
    w: 8.8,
    h: 0.5,
    fontSize: 18,
    color: COLORS.muted,
    fontFace: "Calibri",
  });
  // Channel + period card
  slide.addShape("roundRect" as never, {
    x: 0.6,
    y: 3.8,
    w: 4.2,
    h: 1.4,
    rectRadius: 0.1,
    fill: { color: ch.color, transparency: 92 },
    line: { color: ch.color, width: 0.5, transparency: 80 },
  });
  slide.addText("CANALE", {
    x: 0.85,
    y: 3.95,
    w: 3.5,
    h: 0.3,
    fontSize: 8,
    bold: true,
    color: COLORS.muted,
    fontFace: "Calibri",
    charSpacing: 50,
  });
  slide.addText(ch.name, {
    x: 0.85,
    y: 4.2,
    w: 3.5,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: ch.color,
    fontFace: "Calibri",
  });
  slide.addShape("roundRect" as never, {
    x: 5,
    y: 3.8,
    w: 4.4,
    h: 1.4,
    rectRadius: 0.1,
    fill: { color: COLORS.gold, transparency: 92 },
    line: { color: COLORS.gold, width: 0.5, transparency: 80 },
  });
  slide.addText("PERIODO", {
    x: 5.25,
    y: 3.95,
    w: 4,
    h: 0.3,
    fontSize: 8,
    bold: true,
    color: COLORS.muted,
    fontFace: "Calibri",
    charSpacing: 50,
  });
  slide.addText(`${ctx.o.data.periodFrom} → ${ctx.o.data.periodTo}`, {
    x: 5.25,
    y: 4.2,
    w: 4,
    h: 0.5,
    fontSize: 18,
    bold: true,
    color: COLORS.text,
    fontFace: "Calibri",
  });
  if (ctx.o.data.currency) {
    slide.addText(`Valuta: ${ctx.o.data.currency}`, {
      x: 5.25,
      y: 4.7,
      w: 4,
      h: 0.3,
      fontSize: 11,
      color: COLORS.muted,
      fontFace: "Calibri",
    });
  }
  // Footer
  slide.addText("Generato da AISCAN", {
    x: 0.6,
    y: 7,
    w: 8.8,
    h: 0.3,
    fontSize: 9,
    color: COLORS.muted,
    fontFace: "Calibri",
  });
}

function buildOverview(ctx: BuildContext) {
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Panoramica metriche");
  const k = ctx.o.data.current;
  const cur = ctx.o.data.currency;
  const cards: { label: string; value: string; color: string }[] = [
    {
      label: "Spesa",
      value: fmtMoney(k.amountSpent, cur),
      color: COLORS.gold,
    },
    { label: "Impressioni", value: fmtNum(k.impressions), color: COLORS.blue },
    { label: "Click", value: fmtNum(k.effectiveClicks), color: COLORS.blue },
    { label: "Reach", value: fmtNum(k.reach), color: COLORS.purple },
    {
      label: "CTR",
      value: k.effectiveCtr != null ? `${fmtNum(k.effectiveCtr, { decimals: 2 })}%` : "—",
      color: COLORS.green,
    },
    { label: "CPM", value: fmtMoney(k.cpm, cur), color: COLORS.amber },
    { label: "CPC", value: fmtMoney(k.effectiveCpc, cur), color: COLORS.amber },
    { label: "Frequenza", value: fmtNum(k.frequency, { decimals: 2 }), color: COLORS.purple },
  ];
  // 4 colonne x 2 righe — area: x 0.4-9.6 (9.2), y 1.4-3.6 (2.2)
  const cols = 4;
  const rows = Math.ceil(cards.length / cols);
  const cardW = 9.2 / cols - 0.1;
  const cardH = 2.2 / rows - 0.1;
  cards.forEach((c, i) => {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const x = 0.4 + col * (cardW + 0.13);
    const y = 1.4 + r * (cardH + 0.13);
    slide.addShape("roundRect" as never, {
      x,
      y,
      w: cardW,
      h: cardH,
      rectRadius: 0.05,
      fill: { color: c.color, transparency: 92 },
      line: { color: c.color, width: 0.5, transparency: 80 },
    });
    slide.addText(c.label.toUpperCase(), {
      x: x + 0.15,
      y: y + 0.1,
      w: cardW - 0.3,
      h: 0.25,
      fontSize: 8,
      bold: true,
      color: COLORS.muted,
      fontFace: "Calibri",
      charSpacing: 50,
    });
    slide.addText(c.value, {
      x: x + 0.15,
      y: y + 0.4,
      w: cardW - 0.3,
      h: cardH - 0.5,
      fontSize: 18,
      bold: true,
      color: COLORS.text,
      fontFace: "Calibri",
      valign: "middle",
    });
  });
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "overview"), {
    x: 0.4,
    y: 3.85,
    w: 9.2,
    h: 3.5,
  });
}

function buildPurchases(ctx: BuildContext) {
  const k = ctx.o.data.current;
  if (k.purchases <= 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Acquisti & ROI");
  const cur = ctx.o.data.currency;
  const cards = [
    { label: "Acquisti", value: fmtNum(k.purchases) },
    {
      label: "Costo per acquisto",
      value: fmtMoney(k.costPerPurchase, cur),
    },
    {
      label: "ROAS",
      value: fmtNum(k.roas ?? 0, { decimals: 2 }),
    },
  ];
  const cardW = 2.9;
  const cardH = 1.2;
  cards.forEach((c, i) => {
    const x = 0.4 + i * (cardW + 0.15);
    slide.addShape("roundRect" as never, {
      x,
      y: 1.4,
      w: cardW,
      h: cardH,
      rectRadius: 0.05,
      fill: { color: COLORS.green, transparency: 92 },
      line: { color: COLORS.green, width: 0.5, transparency: 80 },
    });
    slide.addText(c.label.toUpperCase(), {
      x: x + 0.15,
      y: 1.5,
      w: cardW - 0.3,
      h: 0.25,
      fontSize: 8,
      bold: true,
      color: COLORS.muted,
      fontFace: "Calibri",
      charSpacing: 50,
    });
    slide.addText(c.value, {
      x: x + 0.15,
      y: 1.8,
      w: cardW - 0.3,
      h: 0.7,
      fontSize: 22,
      bold: true,
      color: COLORS.text,
      fontFace: "Calibri",
      valign: "middle",
    });
  });
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "purchases"), {
    x: 0.4,
    y: 2.85,
    w: 9.2,
    h: 4.5,
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
  const cards = [
    { label: "Post engagement", value: fmtNum(k.postEngagements) },
    { label: "Visite profilo IG", value: fmtNum(k.instagramProfileVisits) },
    { label: "Follow IG", value: fmtNum(k.instagramFollows) },
  ];
  const cardW = 2.9;
  const cardH = 1.2;
  cards.forEach((c, i) => {
    const x = 0.4 + i * (cardW + 0.15);
    slide.addShape("roundRect" as never, {
      x,
      y: 1.4,
      w: cardW,
      h: cardH,
      rectRadius: 0.05,
      fill: { color: COLORS.rose, transparency: 92 },
      line: { color: COLORS.rose, width: 0.5, transparency: 80 },
    });
    slide.addText(c.label.toUpperCase(), {
      x: x + 0.15,
      y: 1.5,
      w: cardW - 0.3,
      h: 0.25,
      fontSize: 8,
      bold: true,
      color: COLORS.muted,
      fontFace: "Calibri",
      charSpacing: 50,
    });
    slide.addText(c.value, {
      x: x + 0.15,
      y: 1.8,
      w: cardW - 0.3,
      h: 0.7,
      fontSize: 22,
      bold: true,
      color: COLORS.text,
      fontFace: "Calibri",
      valign: "middle",
    });
  });
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "engagement"), {
    x: 0.4,
    y: 2.85,
    w: 9.2,
    h: 4.5,
  });
}

function buildTimeSeries(ctx: BuildContext) {
  if (ctx.o.data.timeSeries.length === 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Andamento giornaliero");
  const labels = ctx.o.data.timeSeries.map((p) => p.date);
  const spend = ctx.o.data.timeSeries.map((p) => p.spend);
  const imp = ctx.o.data.timeSeries.map((p) => p.impressions);
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
      x: 0.4,
      y: 1.4,
      w: 9.2,
      h: 3.0,
      barDir: "col",
      chartColors: [COLORS.gold],
      catAxisLabelFontSize: 8,
      valAxisLabelFontSize: 8,
      showLegend: true,
      legendFontSize: 9,
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
      x: 0.4,
      y: 4.5,
      w: 9.2,
      h: 1.2,
      chartColors: [COLORS.blue],
      catAxisLabelFontSize: 7,
      valAxisLabelFontSize: 7,
      showLegend: true,
      legendFontSize: 8,
      legendPos: "t",
      lineSize: 2,
    },
  );
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "timeSeries"), {
    x: 0.4,
    y: 5.8,
    w: 9.2,
    h: 1.6,
  });
}

function buildTopCampaigns(ctx: BuildContext) {
  if (ctx.o.data.topByCampaignSpend.length === 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Top campagne");
  const cur = ctx.o.data.currency;
  const top = ctx.o.data.topByCampaignSpend.slice(0, 10);
  const tableRows: PptxGenJS.TableRow[] = [
    [
      { text: "CAMPAGNA", options: { bold: true, fontSize: 9, color: COLORS.muted } },
      { text: "SPESA", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
      { text: "IMPR.", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
      { text: "CLICK", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
      { text: "ROAS", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
    ],
    ...top.map((c) => [
      { text: c.campaign_name, options: { fontSize: 9 } },
      { text: fmtMoney(c.spend, cur), options: { fontSize: 9, align: "right" as const } },
      { text: fmtNum(c.impressions), options: { fontSize: 9, align: "right" as const } },
      { text: fmtNum(c.clicks), options: { fontSize: 9, align: "right" as const } },
      {
        text: c.roas != null ? fmtNum(c.roas, { decimals: 2 }) : "—",
        options: { fontSize: 9, align: "right" as const },
      },
    ]),
  ];
  slide.addTable(tableRows, {
    x: 0.4,
    y: 1.4,
    w: 9.2,
    colW: [3.4, 1.6, 1.4, 1.4, 1.4],
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
  });
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "topCampaigns"), {
    x: 0.4,
    y: 4.6,
    w: 9.2,
    h: 2.8,
  });
}

function buildCountries(ctx: BuildContext) {
  const cs = ctx.o.data.countries;
  if (cs.length === 0 || (cs.length === 1 && cs[0].code === "UNKNOWN")) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Distribuzione per paese");
  const cur = ctx.o.data.currency;
  const totalSpend = cs.reduce((s, c) => s + c.spend, 0);
  const showPurch = cs.some((c) => c.purchases > 0);
  const headerRow: PptxGenJS.TableCell[] = [
    { text: "PAESE", options: { bold: true, fontSize: 9, color: COLORS.muted } },
    { text: "CAMP.", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
    { text: "SPESA", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
    { text: "%", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
    { text: "IMPR.", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
    { text: "CLICK", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
  ];
  if (showPurch) {
    headerRow.push({
      text: "ACQ.",
      options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" },
    });
  }
  const rows: PptxGenJS.TableRow[] = [
    headerRow,
    ...cs.map((c) => {
      const pct = totalSpend > 0 ? (c.spend / totalSpend) * 100 : 0;
      const r: PptxGenJS.TableCell[] = [
        { text: `${c.code} · ${c.label}`, options: { fontSize: 9 } },
        { text: fmtNum(c.campaignCount), options: { fontSize: 9, align: "right" as const } },
        { text: fmtMoney(c.spend, cur), options: { fontSize: 9, align: "right" as const } },
        { text: `${fmtNum(pct, { decimals: 1 })}%`, options: { fontSize: 9, align: "right" as const } },
        { text: fmtNum(c.impressions), options: { fontSize: 9, align: "right" as const } },
        { text: fmtNum(c.clicks), options: { fontSize: 9, align: "right" as const } },
      ];
      if (showPurch) {
        r.push({
          text: fmtNum(c.purchases),
          options: { fontSize: 9, align: "right" as const },
        });
      }
      return r;
    }),
  ];
  slide.addTable(rows, {
    x: 0.4,
    y: 1.4,
    w: 9.2,
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
  });
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "countries"), {
    x: 0.4,
    y: 4.4,
    w: 9.2,
    h: 3.0,
  });
}

function buildCampaignTypes(ctx: BuildContext) {
  const ts = ctx.o.data.campaignTypes;
  if (ts.length === 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Tipologia campagna e risultati");
  const cur = ctx.o.data.currency;
  const showPurch = ts.some((b) => b.purchases > 0);
  const head: PptxGenJS.TableCell[] = [
    { text: "TIPO", options: { bold: true, fontSize: 9, color: COLORS.muted } },
    { text: "CAMP.", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
    { text: "SPESA", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
    { text: "RISULT.", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
    { text: "CPR", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" } },
  ];
  if (showPurch) {
    head.push({
      text: "ACQ.",
      options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" },
    });
  }
  const tableRows: PptxGenJS.TableRow[] = [
    head,
    ...ts.map((b) => {
      const r: PptxGenJS.TableCell[] = [
        {
          text: `${b.code} · ${b.label}`,
          options: { fontSize: 9 },
        },
        { text: fmtNum(b.campaignCount), options: { fontSize: 9, align: "right" as const } },
        { text: fmtMoney(b.spend, cur), options: { fontSize: 9, align: "right" as const } },
        {
          text: b.resultCount > 0 ? fmtNum(b.resultCount) : "—",
          options: { fontSize: 9, align: "right" as const },
        },
        {
          text: b.cpr != null ? fmtMoney(b.cpr, cur) : "—",
          options: { fontSize: 9, align: "right" as const },
        },
      ];
      if (showPurch) {
        r.push({
          text: b.purchases > 0 ? fmtNum(b.purchases) : "—",
          options: { fontSize: 9, align: "right" as const },
        });
      }
      return r;
    }),
  ];
  slide.addTable(tableRows, {
    x: 0.4,
    y: 1.4,
    w: 9.2,
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
  });
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "campaignTypes"), {
    x: 0.4,
    y: 4.4,
    w: 9.2,
    h: 3.0,
  });
}

function buildCreatives(ctx: BuildContext) {
  const mix = ctx.o.data.creativeTypeMix;
  const counts = ctx.o.data.creativeCountByType;
  if (mix.length === 0 && counts.length === 0) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Distribuzione creativita'");
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
        x: 0.4,
        y: 1.4,
        w: 4.4,
        h: 3.0,
        chartColors: PIE_PALETTE,
        showLegend: true,
        legendFontSize: 9,
        legendPos: "b",
        showPercent: true,
        dataLabelFontSize: 8,
        dataLabelColor: COLORS.white,
      },
    );
  }
  if (counts.length > 0) {
    const head: PptxGenJS.TableCell[] = [
      {
        text: "TIPO",
        options: { bold: true, fontSize: 9, color: COLORS.muted },
      },
      {
        text: `ASSET / SETT. (${ctx.o.data.creativeCountLabel})`,
        options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right" },
      },
    ];
    const rows: PptxGenJS.TableRow[] = [
      head,
      ...counts.map((c) => [
        { text: c.name, options: { fontSize: 10 } },
        {
          text: fmtNum(c.count, { decimals: 1 }),
          options: { fontSize: 11, align: "right" as const, bold: true },
        },
      ]),
    ];
    slide.addTable(rows, {
      x: 5.0,
      y: 1.4,
      w: 4.6,
      colW: [2.6, 2.0],
      border: { type: "solid", pt: 0.5, color: COLORS.border },
      fontFace: "Calibri",
      color: COLORS.text,
    });
  }
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "creatives"), {
    x: 0.4,
    y: 4.6,
    w: 9.2,
    h: 2.8,
  });
}

function buildObjective(ctx: BuildContext) {
  const om = ctx.o.data.objectiveMix;
  if (om.length === 0 || !om.some((o) => o.name && o.name !== "—")) return;
  const slide = ctx.pres.addSlide();
  addHeader(slide, ctx, "Distribuzione per obiettivo");
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
      x: 1.5,
      y: 1.4,
      w: 7,
      h: 3.0,
      chartColors: PIE_PALETTE,
      showLegend: true,
      legendFontSize: 10,
      legendPos: "r",
      showPercent: true,
      dataLabelFontSize: 9,
      dataLabelColor: COLORS.white,
    },
  );
  addAnalysisBox(slide, findAnalysis(ctx.o.analyses, "objective"), {
    x: 0.4,
    y: 4.6,
    w: 9.2,
    h: 2.8,
  });
}

/* ─── Public API ─────────────────────────────────────── */

export async function buildPerfPptx(opts: BuildOptions): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 inches
  pres.title = `${opts.brandName} — Adv Performance`;
  pres.author = "AISCAN";
  pres.company = opts.clientName;

  // Override layout per usare 10x7.5 (standard 16:9 con margini comodi)
  pres.defineLayout({ name: "AISCAN", width: 10, height: 7.5 });
  pres.layout = "AISCAN";

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

  // pptxgenjs `write` ritorna Promise<Buffer | string | Blob | ArrayBuffer>
  // a seconda del runtime; in Node 20 con outputType "nodebuffer" e' Buffer.
  const buf = (await pres.write({
    outputType: "nodebuffer",
  })) as Buffer;
  return buf;
}
