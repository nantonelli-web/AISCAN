/**
 * PPTX export del modulo Benchmarks (vista comparativa workspace).
 *
 * Costruisce un .pptx con slide riepilogative dei principali
 * aggregati. Supporta Ads (meta/google) + Organic (Instagram) +
 * TikTok riusando i tipi gia' esposti da lib/analytics/benchmarks.ts.
 *
 * Slide:
 *   1. Cover — channel / period / brand / countries
 *   2. KPI totali (totalAds, activeAds, avgDuration, avgCopyLength
 *      per Ads; equivalenti per Organic/TikTok)
 *   3. Volume — bar chart attivi/inattivi (Ads) o post per brand
 *      (Organic/TikTok)
 *   4. Format mix — pie totale + tabella per competitor
 *   5. Top CTAs (Ads) o Top hashtag (Organic/TikTok)
 *   6. Platform distribution (Ads/Meta) o engagement breakdown
 *      (Organic/TikTok)
 *   7. Refresh rate per brand
 */

import PptxGenJS from "pptxgenjs";
import type {
  BenchmarkData,
  OrganicBenchmarkData,
  TiktokBenchmarkData,
} from "@/lib/analytics/benchmarks";
import {
  COLORS,
  PIE_PALETTE,
  MARGIN,
  INNER_W,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  fmtNum,
  addCoverSlide,
  addSlideHeader,
  addKpiGrid,
  fitTable,
  setupWidescreenLayout,
} from "./common";

interface ExportBaseOptions {
  channel: string;
  channelLabel: string;
  channelColor: string;
  dateFrom: string;
  dateTo: string;
  brandNames: string[];
  countries: string[] | null;
}

export type BenchmarksExportOptions =
  | (ExportBaseOptions & { kind: "ads"; data: BenchmarkData })
  | (ExportBaseOptions & { kind: "organic"; data: OrganicBenchmarkData })
  | (ExportBaseOptions & { kind: "tiktok"; data: TiktokBenchmarkData });

const TITLE = "AISCAN — Benchmark";

/* ─── Cover ─────────────────────────────────────────── */

function addCover(pres: PptxGenJS, opts: BenchmarksExportOptions) {
  const subtitle =
    opts.brandNames.length > 0
      ? opts.brandNames.length > 5
        ? `${opts.brandNames.slice(0, 5).join(", ")} + altri ${opts.brandNames.length - 5}`
        : opts.brandNames.join(", ")
      : null;
  addCoverSlide(pres, {
    eyebrow: "Benchmark",
    title: opts.channelLabel,
    subtitle,
    accentColor: opts.channelColor,
    leftBox: {
      label: "Brand",
      value: `${opts.brandNames.length}`,
      color: opts.channelColor,
    },
    rightBox: {
      label: "Periodo",
      value: `${opts.dateFrom} → ${opts.dateTo}`,
      subValue:
        opts.countries && opts.countries.length > 0
          ? `Paesi: ${opts.countries.join(", ")}`
          : undefined,
      color: COLORS.gold,
    },
  });
}

/* ─── Ads (meta/google) slides ───────────────────────── */

function buildAdsSlides(pres: PptxGenJS, opts: ExportBaseOptions & { data: BenchmarkData }) {
  const d = opts.data;
  const baseHeader = (slide: PptxGenJS.Slide, title: string) =>
    addSlideHeader(slide, {
      eyebrowLeft: `${opts.brandNames.length} brand · ${opts.dateFrom} → ${opts.dateTo}`,
      eyebrowRight: opts.channelLabel,
      eyebrowRightBg: opts.channelColor,
      eyebrowRightColor: opts.channelColor,
      title,
    });

  // SLIDE: KPI overview
  {
    const slide = pres.addSlide();
    baseHeader(slide, "KPI complessivi");
    addKpiGrid(
      slide,
      [
        {
          label: "Totale ads",
          value: fmtNum(d.totals.totalAds),
          color: COLORS.gold,
        },
        {
          label: "Attive",
          value: fmtNum(d.totals.activeAds),
          color: COLORS.green,
        },
        {
          label: "Durata media",
          value: `${fmtNum(d.totals.avgDuration, { decimals: 0 })} gg`,
          color: COLORS.blue,
        },
        {
          label: "Lunghezza copy media",
          value: `${fmtNum(d.totals.avgCopyLength, { decimals: 0 })} car.`,
          color: COLORS.purple,
        },
      ],
      { x: MARGIN, y: CONTENT_TOP, w: INNER_W, h: 1.6 },
    );

    // Tabella per competitor
    const headerRow: PptxGenJS.TableCell[] = [
      { text: "BRAND", options: { bold: true, fontSize: 10, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
      { text: "ATTIVE", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
      { text: "INATTIVE", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
      { text: "REFRESH/SETT.", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
      { text: "DURATA MED.", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
      { text: "COPY MED.", options: { bold: true, fontSize: 10, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
    ];
    const refreshMap = new Map(d.refreshRate.map((r) => [r.name, r.adsPerWeek]));
    const durMap = new Map(d.avgDurationByCompetitor.map((r) => [r.name, r.days]));
    const copyMap = new Map(d.avgCopyLengthByCompetitor.map((r) => [r.name, r.chars]));
    const dataRows: PptxGenJS.TableRow[] = d.volumeByCompetitor.map((b) => [
      { text: b.name, options: { fontSize: 10, bold: true } },
      { text: fmtNum(b.active), options: { fontSize: 10, align: "right" as const } },
      { text: fmtNum(b.inactive), options: { fontSize: 10, align: "right" as const } },
      {
        text: fmtNum(refreshMap.get(b.name) ?? 0, { decimals: 1 }),
        options: { fontSize: 10, align: "right" as const },
      },
      {
        text: `${fmtNum(durMap.get(b.name) ?? 0, { decimals: 0 })} gg`,
        options: { fontSize: 10, align: "right" as const },
      },
      {
        text: `${fmtNum(copyMap.get(b.name) ?? 0, { decimals: 0 })} car.`,
        options: { fontSize: 10, align: "right" as const },
      },
    ]);
    const tableY = CONTENT_TOP + 1.85;
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

  // SLIDE: Volume bar
  if (d.volumeByCompetitor.length > 0) {
    const slide = pres.addSlide();
    baseHeader(slide, "Volume per brand");
    slide.addChart(
      pres.ChartType.bar,
      [
        {
          name: "Attive",
          labels: d.volumeByCompetitor.map((v) => v.name),
          values: d.volumeByCompetitor.map((v) => v.active),
        },
        {
          name: "Inattive",
          labels: d.volumeByCompetitor.map((v) => v.name),
          values: d.volumeByCompetitor.map((v) => v.inactive),
        },
      ],
      {
        x: MARGIN,
        y: CONTENT_TOP,
        w: INNER_W,
        h: CONTENT_BOTTOM - CONTENT_TOP - 0.1,
        barDir: "bar",
        barGrouping: "stacked",
        chartColors: [COLORS.green, COLORS.muted],
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        showLegend: true,
        legendFontSize: 11,
        legendPos: "t",
      },
    );
  }

  // SLIDE: Format mix
  if (d.formatMix.length > 0) {
    const slide = pres.addSlide();
    baseHeader(slide, "Format mix");
    const halfW = (INNER_W - 0.4) / 2;
    slide.addChart(
      pres.ChartType.pie,
      [
        {
          name: "Format",
          labels: d.formatMix.map((f) => f.name),
          values: d.formatMix.map((f) => f.value),
        },
      ],
      {
        x: MARGIN,
        y: CONTENT_TOP,
        w: halfW,
        h: 4.5,
        chartColors: PIE_PALETTE,
        showLegend: true,
        legendPos: "b",
        legendFontSize: 10,
        showPercent: true,
        dataLabelFontSize: 9,
        dataLabelColor: COLORS.white,
      },
    );
    if (d.formatByCompetitor.length > 0) {
      const head: PptxGenJS.TableCell[] = [
        { text: "BRAND", options: { bold: true, fontSize: 9, color: COLORS.muted, fill: { color: COLORS.bgLight } } },
        { text: "IMG", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
        { text: "VIDEO", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
        { text: "CAROSEL.", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
        { text: "DPA", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
        { text: "TEXT", options: { bold: true, fontSize: 9, color: COLORS.muted, align: "right", fill: { color: COLORS.bgLight } } },
      ];
      const rows: PptxGenJS.TableRow[] = [
        head,
        ...d.formatByCompetitor.map((b) => [
          { text: b.name, options: { fontSize: 9, bold: true } },
          { text: fmtNum(b.image), options: { fontSize: 9, align: "right" as const } },
          { text: fmtNum(b.video), options: { fontSize: 9, align: "right" as const } },
          { text: fmtNum(b.carousel), options: { fontSize: 9, align: "right" as const } },
          { text: fmtNum(b.dpa), options: { fontSize: 9, align: "right" as const } },
          { text: fmtNum(b.text), options: { fontSize: 9, align: "right" as const } },
        ]),
      ];
      const { rowH, tableH } = fitTable(rows.length, 4.5);
      slide.addTable(rows, {
        x: MARGIN + halfW + 0.4,
        y: CONTENT_TOP,
        w: halfW,
        h: tableH,
        border: { type: "solid", pt: 0.5, color: COLORS.border },
        fontFace: "Calibri",
        color: COLORS.text,
        rowH,
      });
    }
  }

  // SLIDE: Top CTAs (Meta only)
  if (d.topCtas.length > 0 && opts.channel === "meta") {
    const slide = pres.addSlide();
    baseHeader(slide, "Top CTAs");
    slide.addChart(
      pres.ChartType.bar,
      [
        {
          name: "Utilizzi",
          labels: d.topCtas.slice(0, 10).map((c) => c.name),
          values: d.topCtas.slice(0, 10).map((c) => c.count),
        },
      ],
      {
        x: MARGIN,
        y: CONTENT_TOP,
        w: INNER_W,
        h: CONTENT_BOTTOM - CONTENT_TOP - 0.1,
        barDir: "bar",
        chartColors: [COLORS.blue],
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        showLegend: false,
        showValue: true,
        dataLabelFontSize: 10,
      },
    );
  }

  // SLIDE: Platform distribution
  if (d.platformDistribution.length > 0) {
    const slide = pres.addSlide();
    baseHeader(slide, "Distribuzione per piattaforma");
    slide.addChart(
      pres.ChartType.bar,
      [
        {
          name: "Ads",
          labels: d.platformDistribution.map((p) => p.name),
          values: d.platformDistribution.map((p) => p.count),
        },
      ],
      {
        x: MARGIN,
        y: CONTENT_TOP,
        w: INNER_W,
        h: CONTENT_BOTTOM - CONTENT_TOP - 0.1,
        barDir: "bar",
        chartColors: [COLORS.purple],
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        showLegend: false,
        showValue: true,
        dataLabelFontSize: 10,
      },
    );
  }

  // SLIDE: Refresh rate
  if (d.refreshRate.length > 0) {
    const slide = pres.addSlide();
    baseHeader(slide, `Refresh rate (${d.refreshRateWindowDays} giorni)`);
    slide.addChart(
      pres.ChartType.bar,
      [
        {
          name: "Ads / settimana",
          labels: d.refreshRate.map((r) => r.name),
          values: d.refreshRate.map((r) => r.adsPerWeek),
        },
      ],
      {
        x: MARGIN,
        y: CONTENT_TOP,
        w: INNER_W,
        h: CONTENT_BOTTOM - CONTENT_TOP - 0.1,
        barDir: "bar",
        chartColors: [COLORS.gold],
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        showLegend: false,
        showValue: true,
        dataLabelFontSize: 10,
      },
    );
  }
}

/* ─── Organic (Instagram) slides — simplified ────────── */

function buildOrganicSlides(
  pres: PptxGenJS,
  opts: ExportBaseOptions & { data: OrganicBenchmarkData },
) {
  const d = opts.data;
  const baseHeader = (slide: PptxGenJS.Slide, title: string) =>
    addSlideHeader(slide, {
      eyebrowLeft: `${opts.brandNames.length} brand · ${opts.dateFrom} → ${opts.dateTo}`,
      eyebrowRight: opts.channelLabel,
      eyebrowRightBg: opts.channelColor,
      eyebrowRightColor: opts.channelColor,
      title,
    });

  // SLIDE: KPI organici complessivi (se disponibili)
  const totals = (d as unknown as { totals?: { totalPosts?: number; avgLikes?: number; avgComments?: number } }).totals;
  if (totals) {
    const slide = pres.addSlide();
    baseHeader(slide, "KPI organici");
    addKpiGrid(
      slide,
      [
        {
          label: "Totale post",
          value: fmtNum(totals.totalPosts ?? 0),
          color: COLORS.gold,
        },
        {
          label: "Like medi",
          value: fmtNum(totals.avgLikes ?? 0),
          color: COLORS.rose,
        },
        {
          label: "Commenti medi",
          value: fmtNum(totals.avgComments ?? 0),
          color: COLORS.blue,
        },
      ],
      { x: MARGIN, y: CONTENT_TOP, w: INNER_W, h: 1.6 },
    );
  }

  // SLIDE: volume post per brand (postsByCompetitor o simile)
  const volume = (d as unknown as {
    postsByCompetitor?: { name: string; count: number }[];
    volumeByCompetitor?: { name: string; count: number }[];
  });
  const series = volume.postsByCompetitor ?? volume.volumeByCompetitor ?? [];
  if (series.length > 0) {
    const slide = pres.addSlide();
    baseHeader(slide, "Volume post per brand");
    slide.addChart(
      pres.ChartType.bar,
      [
        {
          name: "Post",
          labels: series.map((v) => v.name),
          values: series.map((v) => v.count),
        },
      ],
      {
        x: MARGIN,
        y: CONTENT_TOP,
        w: INNER_W,
        h: CONTENT_BOTTOM - CONTENT_TOP - 0.1,
        barDir: "bar",
        chartColors: [COLORS.rose],
        catAxisLabelFontSize: 10,
        showLegend: false,
        showValue: true,
        dataLabelFontSize: 10,
      },
    );
  }
}

/* ─── TikTok slides — simplified ─────────────────────── */

function buildTiktokSlides(
  pres: PptxGenJS,
  opts: ExportBaseOptions & { data: TiktokBenchmarkData },
) {
  const d = opts.data;
  const baseHeader = (slide: PptxGenJS.Slide, title: string) =>
    addSlideHeader(slide, {
      eyebrowLeft: `${opts.brandNames.length} brand · ${opts.dateFrom} → ${opts.dateTo}`,
      eyebrowRight: opts.channelLabel,
      eyebrowRightBg: opts.channelColor,
      eyebrowRightColor: opts.channelColor,
      title,
    });

  const totals = (d as unknown as { totals?: { totalPosts?: number; avgPlays?: number; avgLikes?: number } }).totals;
  if (totals) {
    const slide = pres.addSlide();
    baseHeader(slide, "KPI TikTok");
    addKpiGrid(
      slide,
      [
        {
          label: "Totale post",
          value: fmtNum(totals.totalPosts ?? 0),
          color: COLORS.gold,
        },
        {
          label: "Play medi",
          value: fmtNum(totals.avgPlays ?? 0),
          color: COLORS.rose,
        },
        {
          label: "Like medi",
          value: fmtNum(totals.avgLikes ?? 0),
          color: COLORS.purple,
        },
      ],
      { x: MARGIN, y: CONTENT_TOP, w: INNER_W, h: 1.6 },
    );
  }
}

/* ─── Public API ─────────────────────────────────────── */

export async function buildBenchmarksPptx(
  opts: BenchmarksExportOptions,
): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.title = `${TITLE} ${opts.channelLabel}`;
  pres.author = "AISCAN";
  setupWidescreenLayout(pres);
  addCover(pres, opts);
  if (opts.kind === "ads") {
    buildAdsSlides(pres, opts);
  } else if (opts.kind === "organic") {
    buildOrganicSlides(pres, opts);
  } else {
    buildTiktokSlides(pres, opts);
  }
  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}
