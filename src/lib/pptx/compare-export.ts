/**
 * PPTX export del modulo Compare (brand comparison detail).
 *
 * Costruisce un .pptx multi-slide con tutte e 4 le viste del
 * compare:
 *   1. Cover (brand selezionati / channel / periodo)
 *   2. Analisi tecnica — KPI table per brand
 *   3. AI - Analisi copy — toneOfVoice / copyStyle / triggers /
 *      strengths / weaknesses + comparison + recommendations
 *   4. AI - Analisi creativa — visualStyle / colorPalette /
 *      photographyStyle / brandConsistency / formatPreferences +
 *      comparison + recommendations
 *   5. Benchmark — vista comparata su volume / format / refresh
 *
 * Le slide AI vengono incluse SOLO se la comparison ha quei
 * dati salvati (non e' detto che entrambe le analisi siano state
 * generate). La slide tecnica e' SEMPRE inclusa.
 */

import PptxGenJS from "pptxgenjs";
import type { CreativeAnalysisResult } from "@/lib/ai/creative-analysis";
import {
  COLORS,
  PIE_PALETTE,
  SLIDE_W,
  MARGIN,
  INNER_W,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  fmtNum,
  addCoverSlide,
  addSlideHeader,
  addAnalysisBox,
  fitTable,
  setupWidescreenLayout,
} from "./common";

/* ─── Types (compatibili con CompStats di compare-view) ──── */

interface AdsCompStatsBase {
  id: string;
  name: string;
  kind: "ads";
  totalAds: number;
  activeAds: number;
  imageCount: number;
  videoCount: number;
  avgDuration: number;
  adsPerWeek: number;
}
interface MetaAdsCompStats extends AdsCompStatsBase {
  channel: "meta";
  topCtas: { name: string; count: number }[];
  platforms: { name: string; count: number }[];
  avgCopyLength: number;
}
interface GoogleAdsCompStats extends AdsCompStatsBase {
  channel: "google";
  platforms: { name: string; count: number }[];
  formatMix: { name: string; count: number }[];
  avgServedDays?: number;
  regionFootprint?: number;
  topCtas: { name: string; count: number }[];
}
type AdsCompStats = MetaAdsCompStats | GoogleAdsCompStats;

interface OrganicCompStats {
  id: string;
  name: string;
  kind: "organic";
  totalPosts: number;
  imageCount: number;
  videoCount: number;
  reelCount: number;
  avgLikes: number;
  avgComments: number;
  avgViews: number;
  postsPerWeek: number;
  avgCaptionLength: number;
  collabPosts?: number;
  collabRate?: number;
  topHashtags: { name: string; count: number }[];
}
interface TiktokCompStats {
  id: string;
  name: string;
  kind: "tiktok";
  totalPosts: number;
  videoCount: number;
  slideshowCount: number;
  avgPlays: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgDuration: number;
  postsPerWeek: number;
  avgCaptionLength: number;
  collabPosts: number;
  collabRate: number;
  topHashtags: { name: string; count: number }[];
}
type CompStats = AdsCompStats | OrganicCompStats | TiktokCompStats;

export interface CompareExportOptions {
  technical: CompStats[] | null;
  copyAnalysis: CreativeAnalysisResult["copywriterReport"] | null;
  visualAnalysis: CreativeAnalysisResult["creativeDirectorReport"] | null;
  channel: string;
  channelLabel: string;
  channelColor: string;
  dateFrom: string | null;
  dateTo: string | null;
  brandNames: string[];
  countries: string[] | null;
}

const PRES_TITLE_PREFIX = "AISCAN — Brand comparison";

/* ─── Cover ─────────────────────────────────────────── */

function addCover(pres: PptxGenJS, opts: CompareExportOptions) {
  const titleBrands = opts.brandNames.length > 0
    ? opts.brandNames.join(" vs ")
    : "Comparison";
  const subtitle =
    opts.countries && opts.countries.length > 0
      ? opts.countries.join(", ")
      : null;
  const periodValue =
    opts.dateFrom && opts.dateTo
      ? `${opts.dateFrom} → ${opts.dateTo}`
      : "Tutto lo storico";
  addCoverSlide(pres, {
    eyebrow: "Brand Comparison",
    title: titleBrands,
    subtitle,
    accentColor: opts.channelColor,
    leftBox: {
      label: "Canale",
      value: opts.channelLabel,
      color: opts.channelColor,
    },
    rightBox: {
      label: "Periodo",
      value: periodValue,
      color: COLORS.gold,
    },
  });
}

/* ─── Slide: Analisi tecnica ──────────────────────────── */

function buildKpiRowsForKind(
  stats: CompStats[],
): { headers: string[]; rows: string[][]; title: string } | null {
  if (stats.length === 0) return null;
  const kind = stats[0].kind;
  if (kind === "ads") {
    const ads = stats as AdsCompStats[];
    const headers = ["BRAND", "TOT ADS", "ATTIVE", "IMG", "VIDEO", "ADS/SETT.", "DURATA MED."];
    const rows = ads.map((s) => [
      s.name,
      fmtNum(s.totalAds),
      fmtNum(s.activeAds),
      fmtNum(s.imageCount),
      fmtNum(s.videoCount),
      fmtNum(s.adsPerWeek, { decimals: 1 }),
      `${fmtNum(s.avgDuration, { decimals: 0 })} gg`,
    ]);
    return { headers, rows, title: "Analisi tecnica" };
  }
  if (kind === "organic") {
    const o = stats as OrganicCompStats[];
    const headers = ["BRAND", "POST", "REEL", "VIDEO", "IMG", "LIKE MED.", "COMM MED.", "POST/SETT."];
    const rows = o.map((s) => [
      s.name,
      fmtNum(s.totalPosts),
      fmtNum(s.reelCount),
      fmtNum(s.videoCount),
      fmtNum(s.imageCount),
      fmtNum(s.avgLikes),
      fmtNum(s.avgComments),
      fmtNum(s.postsPerWeek, { decimals: 1 }),
    ]);
    return { headers, rows, title: "Analisi tecnica organic" };
  }
  if (kind === "tiktok") {
    const t = stats as TiktokCompStats[];
    const headers = ["BRAND", "POST", "VIDEO", "PLAY MED.", "LIKE MED.", "DUR. MED.", "POST/SETT.", "% COLLAB"];
    const rows = t.map((s) => [
      s.name,
      fmtNum(s.totalPosts),
      fmtNum(s.videoCount),
      fmtNum(s.avgPlays),
      fmtNum(s.avgLikes),
      `${fmtNum(s.avgDuration, { decimals: 1 })}s`,
      fmtNum(s.postsPerWeek, { decimals: 1 }),
      `${fmtNum(s.collabRate, { decimals: 1 })}%`,
    ]);
    return { headers, rows, title: "Analisi tecnica TikTok" };
  }
  return null;
}

function buildTechnicalSlide(
  pres: PptxGenJS,
  opts: CompareExportOptions,
) {
  if (!opts.technical || opts.technical.length === 0) return;
  const slide = pres.addSlide();
  addSlideHeader(slide, {
    eyebrowLeft: opts.brandNames.join(" · "),
    eyebrowRight: opts.channelLabel,
    eyebrowRightBg: opts.channelColor,
    eyebrowRightColor: opts.channelColor,
    title: "Analisi tecnica",
  });
  const kpi = buildKpiRowsForKind(opts.technical);
  if (!kpi) return;
  // Tabella principale KPI
  const headerRow: PptxGenJS.TableCell[] = kpi.headers.map((h, i) => ({
    text: h,
    options: {
      bold: true,
      fontSize: 10,
      color: COLORS.muted,
      align: i === 0 ? ("left" as const) : ("right" as const),
      fill: { color: COLORS.bgLight },
    },
  }));
  const dataRows: PptxGenJS.TableRow[] = kpi.rows.map((r) =>
    r.map((c, i) => ({
      text: c,
      options: {
        fontSize: 10,
        bold: i === 0,
        align: i === 0 ? ("left" as const) : ("right" as const),
      },
    })),
  );
  const allRows = [headerRow, ...dataRows];
  const { rowH, tableH } = fitTable(allRows.length, 2.0);
  slide.addTable(allRows, {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: tableH,
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
    rowH,
  });
  // Chart secondario: distribuzione ads/post per brand
  const chartY = CONTENT_TOP + tableH + 0.4;
  if (chartY < 5.5) {
    const stats = opts.technical;
    const labels = stats.map((s) => s.name);
    let values: number[];
    let chartName: string;
    if (stats[0].kind === "ads") {
      values = (stats as AdsCompStats[]).map((s) => s.totalAds);
      chartName = "Totale ads";
    } else if (stats[0].kind === "organic") {
      values = (stats as OrganicCompStats[]).map((s) => s.totalPosts);
      chartName = "Totale post";
    } else {
      values = (stats as TiktokCompStats[]).map((s) => s.totalPosts);
      chartName = "Totale post";
    }
    slide.addChart(
      pres.ChartType.bar,
      [{ name: chartName, labels, values }],
      {
        x: MARGIN,
        y: chartY,
        w: INNER_W,
        h: CONTENT_BOTTOM - chartY - 0.1,
        barDir: "bar",
        chartColors: [COLORS.gold],
        catAxisLabelFontSize: 9,
        valAxisLabelFontSize: 9,
        showLegend: false,
        showValue: true,
        dataLabelFontSize: 9,
      },
    );
  }
}

/* ─── Slide: Analisi copy AI ──────────────────────────── */

function buildCopySlide(
  pres: PptxGenJS,
  opts: CompareExportOptions,
) {
  const copy = opts.copyAnalysis;
  if (!copy) return;
  const slide = pres.addSlide();
  addSlideHeader(slide, {
    eyebrowLeft: opts.brandNames.join(" · "),
    eyebrowRight: opts.channelLabel,
    eyebrowRightBg: opts.channelColor,
    eyebrowRightColor: opts.channelColor,
    title: "AI · Analisi copy",
  });
  // Tabella: 1 riga per brand, colonne brand info
  const head: PptxGenJS.TableCell[] = [
    { text: "BRAND", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "TONE OF VOICE", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "STILE COPY", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "TRIGGER", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "PUNTI FORTI", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "PUNTI DEBOLI", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
  ];
  const rows: PptxGenJS.TableRow[] = [
    head,
    ...copy.brandAnalyses.map((b) => [
      { text: b.brandName, options: { fontSize: 9, bold: true } },
      { text: b.toneOfVoice ?? "—", options: { fontSize: 9 } },
      { text: b.copyStyle ?? "—", options: { fontSize: 9 } },
      {
        text: (b.emotionalTriggers ?? []).join(", "),
        options: { fontSize: 9 },
      },
      { text: b.strengths ?? "—", options: { fontSize: 9 } },
      { text: b.weaknesses ?? "—", options: { fontSize: 9 } },
    ]),
  ];
  const { rowH, tableH } = fitTable(rows.length, 3.4);
  slide.addTable(rows, {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: tableH,
    colW: [
      INNER_W * 0.13,
      INNER_W * 0.16,
      INNER_W * 0.16,
      INNER_W * 0.18,
      INNER_W * 0.19,
      INNER_W * 0.18,
    ],
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
    rowH,
  });

  // Comparison + Recommendations come blocchi testuali
  const aY = CONTENT_TOP + tableH + 0.3;
  const halfW = (INNER_W - 0.3) / 2;
  if (copy.comparison) {
    addAnalysisBox(
      slide,
      copy.comparison,
      { x: MARGIN, y: aY, w: halfW, h: CONTENT_BOTTOM - aY },
      "CONFRONTO",
    );
  }
  if (copy.recommendations) {
    addAnalysisBox(
      slide,
      copy.recommendations,
      { x: MARGIN + halfW + 0.3, y: aY, w: halfW, h: CONTENT_BOTTOM - aY },
      "RACCOMANDAZIONI",
    );
  }
}

/* ─── Slide: Analisi creativa AI ─────────────────────── */

function buildVisualSlide(
  pres: PptxGenJS,
  opts: CompareExportOptions,
) {
  const visual = opts.visualAnalysis;
  if (!visual) return;
  const slide = pres.addSlide();
  addSlideHeader(slide, {
    eyebrowLeft: opts.brandNames.join(" · "),
    eyebrowRight: opts.channelLabel,
    eyebrowRightBg: opts.channelColor,
    eyebrowRightColor: opts.channelColor,
    title: "AI · Analisi creativa",
  });
  const head: PptxGenJS.TableCell[] = [
    { text: "BRAND", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "STILE VISIVO", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "PALETTE", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "FOTOGRAFIA", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "PUNTI FORTI", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
    { text: "PUNTI DEBOLI", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
  ];
  const rows: PptxGenJS.TableRow[] = [
    head,
    ...visual.brandAnalyses.map((b) => [
      { text: b.brandName, options: { fontSize: 9, bold: true } },
      { text: b.visualStyle ?? "—", options: { fontSize: 9 } },
      { text: b.colorPalette ?? "—", options: { fontSize: 9 } },
      { text: b.photographyStyle ?? "—", options: { fontSize: 9 } },
      { text: b.strengths ?? "—", options: { fontSize: 9 } },
      { text: b.weaknesses ?? "—", options: { fontSize: 9 } },
    ]),
  ];
  const { rowH, tableH } = fitTable(rows.length, 3.4);
  slide.addTable(rows, {
    x: MARGIN,
    y: CONTENT_TOP,
    w: INNER_W,
    h: tableH,
    colW: [
      INNER_W * 0.13,
      INNER_W * 0.18,
      INNER_W * 0.16,
      INNER_W * 0.16,
      INNER_W * 0.19,
      INNER_W * 0.18,
    ],
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
    rowH,
  });
  const aY = CONTENT_TOP + tableH + 0.3;
  const halfW = (INNER_W - 0.3) / 2;
  if (visual.comparison) {
    addAnalysisBox(
      slide,
      visual.comparison,
      { x: MARGIN, y: aY, w: halfW, h: CONTENT_BOTTOM - aY },
      "CONFRONTO",
    );
  }
  if (visual.recommendations) {
    addAnalysisBox(
      slide,
      visual.recommendations,
      { x: MARGIN + halfW + 0.3, y: aY, w: halfW, h: CONTENT_BOTTOM - aY },
      "RACCOMANDAZIONI",
    );
  }
}

/* ─── Slide: Benchmark ──────────────────────────────── */

function buildBenchmarkSlide(
  pres: PptxGenJS,
  opts: CompareExportOptions,
) {
  if (!opts.technical || opts.technical.length === 0) return;
  const stats = opts.technical;
  const slide = pres.addSlide();
  addSlideHeader(slide, {
    eyebrowLeft: opts.brandNames.join(" · "),
    eyebrowRight: opts.channelLabel,
    eyebrowRightBg: opts.channelColor,
    eyebrowRightColor: opts.channelColor,
    title: "Benchmark",
  });
  // 2 chart side-by-side: refresh rate (a sx) + format mix totale (a dx)
  const labels = stats.map((s) => s.name);
  // Refresh rate: ads per week (ads) / posts per week (organic+tiktok)
  const refreshValues = stats.map((s) => {
    if (s.kind === "ads") return s.adsPerWeek;
    return (s as OrganicCompStats | TiktokCompStats).postsPerWeek;
  });
  const halfW = (INNER_W - 0.3) / 2;
  slide.addChart(
    pres.ChartType.bar,
    [{ name: "Refresh rate (per settimana)", labels, values: refreshValues }],
    {
      x: MARGIN,
      y: CONTENT_TOP,
      w: halfW,
      h: 3.0,
      barDir: "bar",
      chartColors: [COLORS.gold],
      catAxisLabelFontSize: 9,
      valAxisLabelFontSize: 9,
      showLegend: false,
      showValue: true,
      dataLabelFontSize: 9,
      showTitle: true,
      title: "Refresh rate",
      titleFontSize: 12,
    },
  );
  // Format mix totale (image vs video/reel)
  let imgTotal = 0;
  let videoTotal = 0;
  let extra = 0;
  for (const s of stats) {
    if (s.kind === "ads") {
      imgTotal += s.imageCount;
      videoTotal += s.videoCount;
    } else if (s.kind === "organic") {
      imgTotal += s.imageCount;
      videoTotal += s.videoCount + s.reelCount;
    } else {
      videoTotal += s.videoCount;
      extra += s.slideshowCount;
    }
  }
  const mixData = [
    { name: "Immagine", value: imgTotal },
    { name: "Video", value: videoTotal },
    ...(extra > 0 ? [{ name: "Slideshow", value: extra }] : []),
  ].filter((d) => d.value > 0);
  if (mixData.length > 0) {
    slide.addChart(
      pres.ChartType.pie,
      [
        {
          name: "Format mix",
          labels: mixData.map((d) => d.name),
          values: mixData.map((d) => d.value),
        },
      ],
      {
        x: MARGIN + halfW + 0.3,
        y: CONTENT_TOP,
        w: halfW,
        h: 3.0,
        chartColors: PIE_PALETTE,
        showLegend: true,
        legendFontSize: 9,
        legendPos: "b",
        showPercent: true,
        dataLabelFontSize: 8,
        dataLabelColor: COLORS.white,
        showTitle: true,
        title: "Format mix",
        titleFontSize: 12,
      },
    );
  }
  // Tabella riassuntiva sotto
  const headers = ["BRAND", "TOTALE", "ATTIVE", "REFRESH/SETT.", "% VIDEO"];
  const headerRow: PptxGenJS.TableCell[] = headers.map((h, i) => ({
    text: h,
    options: {
      bold: true,
      fontSize: 10,
      color: COLORS.muted,
      align: i === 0 ? ("left" as const) : ("right" as const),
      fill: { color: COLORS.bgLight },
    },
  }));
  const dataRows: PptxGenJS.TableRow[] = stats.map((s) => {
    let total = 0;
    let active = 0;
    let refresh = 0;
    let imgs = 0;
    let videos = 0;
    if (s.kind === "ads") {
      total = s.totalAds;
      active = s.activeAds;
      refresh = s.adsPerWeek;
      imgs = s.imageCount;
      videos = s.videoCount;
    } else if (s.kind === "organic") {
      total = s.totalPosts;
      active = s.totalPosts;
      refresh = s.postsPerWeek;
      imgs = s.imageCount;
      videos = s.videoCount + s.reelCount;
    } else {
      total = s.totalPosts;
      active = s.totalPosts;
      refresh = s.postsPerWeek;
      videos = s.videoCount;
    }
    const denom = imgs + videos;
    const videoPct = denom > 0 ? (videos / denom) * 100 : 0;
    return [
      { text: s.name, options: { fontSize: 10, bold: true } },
      { text: fmtNum(total), options: { fontSize: 10, align: "right" as const } },
      { text: fmtNum(active), options: { fontSize: 10, align: "right" as const } },
      {
        text: fmtNum(refresh, { decimals: 1 }),
        options: { fontSize: 10, align: "right" as const },
      },
      {
        text: `${fmtNum(videoPct, { decimals: 1 })}%`,
        options: { fontSize: 10, align: "right" as const },
      },
    ];
  });
  const tableY = CONTENT_TOP + 3.2;
  const allRows = [headerRow, ...dataRows];
  const { rowH, tableH } = fitTable(allRows.length, CONTENT_BOTTOM - tableY);
  slide.addTable(allRows, {
    x: MARGIN,
    y: tableY,
    w: INNER_W,
    h: tableH,
    border: { type: "solid", pt: 0.5, color: COLORS.border },
    fontFace: "Calibri",
    color: COLORS.text,
    rowH,
  });
}

/* ─── Public API ─────────────────────────────────────── */

export async function buildComparePptx(
  opts: CompareExportOptions,
): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.title = `${PRES_TITLE_PREFIX} — ${opts.brandNames.join(" vs ")}`;
  pres.author = "AISCAN";
  setupWidescreenLayout(pres);
  addCover(pres, opts);
  buildTechnicalSlide(pres, opts);
  buildCopySlide(pres, opts);
  buildVisualSlide(pres, opts);
  buildBenchmarkSlide(pres, opts);
  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}
