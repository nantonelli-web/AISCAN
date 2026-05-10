/**
 * Helper PPTX condivisi fra i vari export del progetto
 * (Adv Performance, Compare detail, Benchmarks).
 *
 * Geometria di riferimento: 16:9 widescreen 13.333" x 7.5".
 * Tutti i layout costruiti sopra a queste costanti per
 * consistency cross-modulo.
 */

import PptxGenJS from "pptxgenjs";

/* ─── Geometry ───────────────────────────────────────── */

export const SLIDE_W = 13.333;
export const SLIDE_H = 7.5;
export const MARGIN = 0.5;
export const INNER_W = SLIDE_W - 2 * MARGIN;
export const HEADER_TOP = 0.3;
export const TITLE_TOP = 0.65;
export const DIVIDER_Y = 1.25;
export const CONTENT_TOP = 1.5;
export const CONTENT_BOTTOM = 7.2;

/* ─── Colors ─────────────────────────────────────────── */

export const COLORS = {
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

export const PIE_PALETTE = [
  COLORS.gold,
  COLORS.blue,
  COLORS.green,
  COLORS.orange,
  COLORS.purple,
  COLORS.muted,
];

/* ─── Format helpers ─────────────────────────────────── */

export function fmtNum(
  n: number | null | undefined,
  opts?: { decimals?: number },
): string {
  if (n == null) return "—";
  const d = opts?.decimals ?? 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);
}

export function fmtMoney(
  n: number | null | undefined,
  currency: string | null,
): string {
  if (n == null) return "—";
  const v = fmtNum(n, { decimals: 2 });
  return currency ? `${v} ${currency}` : v;
}

export function fmtPct(
  n: number | null | undefined,
  decimals = 1,
): string {
  if (n == null) return "—";
  return `${fmtNum(n, { decimals })}%`;
}

/* ─── Text formatting ────────────────────────────────── */

export function inlineRuns(
  text: string,
): { text: string; options?: { bold?: boolean } }[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  return parts.map((p) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return { text: p.slice(2, -2), options: { bold: true } };
    }
    return { text: p };
  });
}

export function buildTextRuns(content: string): PptxGenJS.TextProps[] {
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

/* ─── Layout primitives ──────────────────────────────── */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function addSlideHeader(
  slide: PptxGenJS.Slide,
  args: {
    eyebrowLeft?: string;
    eyebrowRight?: string;
    eyebrowRightBg?: string;
    eyebrowRightColor?: string;
    title: string;
  },
) {
  if (args.eyebrowLeft) {
    slide.addText(args.eyebrowLeft, {
      x: MARGIN,
      y: HEADER_TOP,
      w: 8,
      h: 0.3,
      fontSize: 10,
      bold: true,
      color: COLORS.text,
      fontFace: "Calibri",
    });
  }
  if (args.eyebrowRight) {
    const pillW = 1.8;
    slide.addText(args.eyebrowRight, {
      x: SLIDE_W - MARGIN - pillW,
      y: HEADER_TOP - 0.03,
      w: pillW,
      h: 0.36,
      fontSize: 11,
      fontFace: "Calibri",
      bold: true,
      color: args.eyebrowRightColor ?? COLORS.muted,
      align: "center",
      valign: "middle",
      fill: {
        color: args.eyebrowRightBg ?? COLORS.muted,
        transparency: 88,
      },
      rectRadius: 0.05,
    });
  }
  slide.addText(args.title.toUpperCase(), {
    x: MARGIN,
    y: TITLE_TOP,
    w: INNER_W,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: COLORS.text,
    fontFace: "Calibri",
  });
  slide.addShape("rect" as never, {
    x: MARGIN,
    y: DIVIDER_Y,
    w: INNER_W,
    h: 0.02,
    fill: { color: COLORS.border },
    line: { color: COLORS.border, width: 0 },
  });
}

export function addAnalysisBox(
  slide: PptxGenJS.Slide,
  content: string | null,
  area: Box,
  label: string = "ANALISI AI",
) {
  if (!content) return;
  slide.addShape("roundRect" as never, {
    x: area.x,
    y: area.y,
    w: area.w,
    h: area.h,
    rectRadius: 0.06,
    fill: { color: COLORS.violet, transparency: 95 },
    line: { color: COLORS.violet, width: 0.5, transparency: 70 },
  });
  slide.addText(label, {
    x: area.x + 0.18,
    y: area.y + 0.1,
    w: 4,
    h: 0.25,
    fontSize: 8,
    bold: true,
    color: COLORS.violet,
    fontFace: "Calibri",
  });
  slide.addText(buildTextRuns(content), {
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

/* ─── KPI grid ────────────────────────────────────────── */

export interface KpiCard {
  label: string;
  value: string;
  color?: string;
}

export function addKpiGrid(
  slide: PptxGenJS.Slide,
  cards: KpiCard[],
  area: Box,
) {
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
    const fillColor = c.color ?? COLORS.muted;

    slide.addShape("roundRect" as never, {
      x,
      y,
      w: cardW,
      h: cardH,
      rectRadius: 0.08,
      fill: { color: fillColor, transparency: 92 },
      line: { color: fillColor, width: 0.6, transparency: 75 },
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
    });
    const valueLen = c.value.length;
    let valueFontSize = 18;
    if (cardW < 2.6) valueFontSize = 16;
    if (valueLen > 12) valueFontSize = 16;
    if (valueLen > 16) valueFontSize = 14;
    slide.addText(c.value, {
      x: x + 0.18,
      y: y + 0.5,
      w: cardW - 0.36,
      h: cardH - 0.65,
      fontSize: valueFontSize,
      bold: true,
      color: COLORS.text,
      fontFace: "Calibri",
      valign: "middle",
      shrinkText: true,
    });
  });
}

/* ─── Table sizing ───────────────────────────────────── */

export function fitTable(
  nRows: number,
  maxAreaH: number,
): { rowH: number; tableH: number } {
  const rowH = Math.min(0.42, Math.max(0.26, maxAreaH / nRows));
  const tableH = rowH * nRows;
  return { rowH, tableH };
}

/* ─── Cover slide ────────────────────────────────────── */

export function addCoverSlide(
  pres: PptxGenJS,
  args: {
    eyebrow: string;
    title: string;
    subtitle?: string | null;
    accentColor?: string;
    leftBox?: { label: string; value: string; color: string };
    rightBox?: { label: string; value: string; subValue?: string; color: string };
  },
) {
  const slide = pres.addSlide();
  slide.background = { color: COLORS.white };
  const accent = args.accentColor ?? COLORS.gold;
  slide.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 0.18,
    fill: { color: accent },
    line: { color: accent, width: 0 },
  });
  slide.addText(args.eyebrow.toUpperCase(), {
    x: 0.8,
    y: 1.4,
    w: SLIDE_W - 1.6,
    h: 0.5,
    fontSize: 14,
    bold: true,
    color: COLORS.muted,
    fontFace: "Calibri",
  });
  slide.addText(args.title, {
    x: 0.8,
    y: 2.0,
    w: SLIDE_W - 1.6,
    h: 1.4,
    fontSize: 48,
    bold: true,
    color: COLORS.text,
    fontFace: "Calibri",
    shrinkText: true,
  });
  if (args.subtitle) {
    slide.addText(args.subtitle, {
      x: 0.8,
      y: 3.5,
      w: SLIDE_W - 1.6,
      h: 0.5,
      fontSize: 20,
      color: COLORS.muted,
      fontFace: "Calibri",
    });
  }
  // Two info boxes
  if (args.leftBox || args.rightBox) {
    const boxW = 5.5;
    const boxH = 1.5;
    const boxY = 4.6;
    const gap = 0.5;
    const totalW = 2 * boxW + gap;
    const startX = (SLIDE_W - totalW) / 2;

    if (args.leftBox) {
      slide.addShape("roundRect" as never, {
        x: startX,
        y: boxY,
        w: boxW,
        h: boxH,
        rectRadius: 0.1,
        fill: { color: args.leftBox.color, transparency: 92 },
        line: { color: args.leftBox.color, width: 0.7, transparency: 75 },
      });
      slide.addText(args.leftBox.label.toUpperCase(), {
        x: startX + 0.3,
        y: boxY + 0.2,
        w: boxW - 0.6,
        h: 0.3,
        fontSize: 9,
        bold: true,
        color: COLORS.muted,
        fontFace: "Calibri",
      });
      slide.addText(args.leftBox.value, {
        x: startX + 0.3,
        y: boxY + 0.55,
        w: boxW - 0.6,
        h: 0.7,
        fontSize: 24,
        bold: true,
        color: args.leftBox.color,
        fontFace: "Calibri",
        shrinkText: true,
      });
    }
    if (args.rightBox) {
      const rightX = startX + boxW + gap;
      slide.addShape("roundRect" as never, {
        x: rightX,
        y: boxY,
        w: boxW,
        h: boxH,
        rectRadius: 0.1,
        fill: { color: args.rightBox.color, transparency: 92 },
        line: { color: args.rightBox.color, width: 0.7, transparency: 75 },
      });
      slide.addText(args.rightBox.label.toUpperCase(), {
        x: rightX + 0.3,
        y: boxY + 0.2,
        w: boxW - 0.6,
        h: 0.3,
        fontSize: 9,
        bold: true,
        color: COLORS.muted,
        fontFace: "Calibri",
      });
      slide.addText(args.rightBox.value, {
        x: rightX + 0.3,
        y: boxY + 0.55,
        w: boxW - 0.6,
        h: 0.5,
        fontSize: 22,
        bold: true,
        color: COLORS.text,
        fontFace: "Calibri",
        shrinkText: true,
      });
      if (args.rightBox.subValue) {
        slide.addText(args.rightBox.subValue, {
          x: rightX + 0.3,
          y: boxY + 1.05,
          w: boxW - 0.6,
          h: 0.3,
          fontSize: 12,
          color: COLORS.muted,
          fontFace: "Calibri",
        });
      }
    }
  }
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
  return slide;
}

/* ─── Layout setup ───────────────────────────────────── */

export function setupWidescreenLayout(pres: PptxGenJS) {
  pres.defineLayout({
    name: "AISCAN_WIDESCREEN",
    width: SLIDE_W,
    height: SLIDE_H,
  });
  pres.layout = "AISCAN_WIDESCREEN";
}

/* ─── Buffer helper for Next.js Response ─────────────── */

export function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}
