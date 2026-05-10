/**
 * Snapchat Ads export parser. Riusa parseLocalNumber + parseDate
 * dal Meta parser per coerenza, ma il dictionary di colonne e'
 * specifico Snapchat (subset di campi rispetto a Meta).
 *
 * Schema standard Snapchat Ads Manager export (sample 2026-05):
 *   Week, Campaign Name, Ad Set Id, Ad Set Name, Creative Id,
 *   Ad Id, Ad Name, Amount Spent, Paid Impressions, Clicks,
 *   Landing Page Views, Adds To Cart, Purchases, Purchases Value
 *
 * Niente Reach / Frequency / CTR / CPM / CPC espliciti — i KPI
 * derivati vengono calcolati in aggregator. La currency NON e'
 * nei header dell'export (Snapchat non la suffix), quindi la
 * leggiamo dal payload upload (campo manuale) e la persistiamo
 * nel mait_perf_imports.currency.
 */

import Papa from "papaparse";
import ExcelJS from "exceljs";
import {
  parseLocalNumber,
  parseDate,
} from "./meta-parser";
import { isoWeekToMonday } from "./iso-week";
import type { PerfDiagnostic } from "@/types/perf";

export interface SnapchatPerfRow {
  date: string | null; // ISO o null se l'export e' weekly without date
  week: string | null;
  campaign_name: string | null;
  campaign_id: string | null;
  ad_set_name: string | null;
  ad_set_id: string | null;
  ad_name: string | null;
  ad_id: string | null;
  creative_id: string | null;

  amount_spent: number;
  paid_impressions: number;
  clicks: number;
  landing_page_views: number;
  adds_to_cart: number;
  purchases: number;
  purchase_value: number;

  creative_type: string | null;
  creative_count: number | null;

  raw_data: Record<string, unknown>;
}

export interface SnapchatParseResult {
  rows: SnapchatPerfRow[];
  detectedColumns: Record<string, string>;
  periodFrom: string | null;
  periodTo: string | null;
  /** Currency NON estraibile dal file Snapchat — propagata da
   *  altro layer (campo manuale all'upload). */
  currency: string | null;
  diagnostics: PerfDiagnostic[];
}

const COLUMN_SYNONYMS: Record<string, string[]> = {
  week: ["week", "settimana"],
  reporting_starts: [
    "reporting starts",
    "start date",
    "start",
    "data inizio",
  ],
  reporting_ends: [
    "reporting ends",
    "end date",
    "end",
    "data fine",
  ],
  campaign_name: ["campaign name", "nome campagna"],
  campaign_id: ["campaign id"],
  ad_set_name: ["ad set name", "nome gruppo di inserzioni"],
  ad_set_id: ["ad set id"],
  ad_name: ["ad name", "nome inserzione"],
  ad_id: ["ad id"],
  creative_id: ["creative id"],
  amount_spent: [
    "amount spent",
    "spend",
    "importo speso",
    "spesa",
  ],
  paid_impressions: [
    "paid impressions",
    "impressions",
    "impressioni",
  ],
  clicks: ["clicks", "swipe ups", "clic"],
  landing_page_views: [
    "landing page views",
    "lpv",
    "visite pagina di destinazione",
  ],
  adds_to_cart: ["adds to cart", "add to cart"],
  purchases: ["purchases", "acquisti"],
  purchase_value: [
    "purchases value",
    "purchase value",
    "purchase conversion value",
    "valore acquisti",
  ],
  creative_type: [
    "creative type",
    "tipo creativita",
    "tipo creatività",
    "format type",
  ],
  creative_count: [
    "num. creatività",
    "num creatività",
    "creative count",
    "num creatives",
  ],
};

function normHeader(h: string): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

interface DetectedHeader {
  rowIndex: number;
  headers: string[];
  colMap: Record<string, number>;
}

function detectHeader(rows: unknown[][]): DetectedHeader | null {
  const REQUIRED_HITS = 3;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i] ?? [];
    const headers = row.map((c) => String(c ?? ""));
    const colMap: Record<string, number> = {};
    let hits = 0;
    for (const [key, syns] of Object.entries(COLUMN_SYNONYMS)) {
      const synSet = new Set(syns.map(normHeader));
      const idx = headers.findIndex((h) => synSet.has(normHeader(h)));
      if (idx >= 0) {
        colMap[key] = idx;
        hits++;
      }
    }
    if (hits >= REQUIRED_HITS) {
      return { rowIndex: i, headers, colMap };
    }
  }
  return null;
}

async function readCsv(buffer: Buffer): Promise<unknown[][]> {
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const result = Papa.parse<unknown[]>(text, { skipEmptyLines: true });
  return result.data;
}

async function readXlsx(buffer: Buffer): Promise<unknown[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer,
  );
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const out: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const arr: unknown[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value as unknown;
      if (
        v &&
        typeof v === "object" &&
        "result" in (v as Record<string, unknown>)
      ) {
        arr.push((v as { result: unknown }).result);
      } else {
        arr.push(v);
      }
    });
    out.push(arr);
  });
  return out;
}

const i = (raw: unknown): number => {
  const n = parseLocalNumber(raw);
  return n == null ? 0 : Math.round(n);
};

export async function parseSnapchatExport(
  buffer: Buffer,
  filename: string,
): Promise<SnapchatParseResult> {
  const diagnostics: PerfDiagnostic[] = [];
  const isXlsx = /\.xlsx$/i.test(filename);
  const isCsv = /\.csv$/i.test(filename);
  if (!isXlsx && !isCsv) {
    diagnostics.push({
      severity: "error",
      code: "unsupported_format",
      message: "File extension must be .csv or .xlsx",
    });
    return {
      rows: [],
      detectedColumns: {},
      periodFrom: null,
      periodTo: null,
      currency: null,
      diagnostics,
    };
  }

  let rawRows: unknown[][];
  try {
    rawRows = isXlsx ? await readXlsx(buffer) : await readCsv(buffer);
  } catch (e) {
    diagnostics.push({
      severity: "error",
      code: "parse_failure",
      message: `Could not read file: ${(e as Error).message}`,
    });
    return {
      rows: [],
      detectedColumns: {},
      periodFrom: null,
      periodTo: null,
      currency: null,
      diagnostics,
    };
  }

  const header = detectHeader(rawRows);
  if (!header) {
    diagnostics.push({
      severity: "error",
      code: "header_not_found",
      message:
        "Header non rilevato. Verifica che il file sia un export Snapchat Ads Manager con colonne tipo 'Week', 'Campaign Name', 'Amount Spent', 'Paid Impressions'.",
    });
    return {
      rows: [],
      detectedColumns: {},
      periodFrom: null,
      periodTo: null,
      currency: null,
      diagnostics,
    };
  }

  const detectedColumns: Record<string, string> = {};
  for (const [key, colIdx] of Object.entries(header.colMap)) {
    detectedColumns[header.headers[colIdx] ?? ""] = key;
  }

  const requiredKeys = ["amount_spent", "paid_impressions"];
  const missingRequired = requiredKeys.filter((k) => !(k in header.colMap));
  if (!("campaign_name" in header.colMap)) missingRequired.push("campaign_name");
  if (!("week" in header.colMap || "reporting_starts" in header.colMap)) {
    missingRequired.push("week or reporting_starts");
  }
  if (missingRequired.length > 0) {
    diagnostics.push({
      severity: "error",
      code: "missing_required_columns",
      message: `Colonne richieste mancanti: ${missingRequired.join(", ")}`,
      context: { missing: missingRequired },
    });
  }

  const get = (row: unknown[], key: string): unknown => {
    const idx = header.colMap[key];
    return idx == null ? undefined : row[idx];
  };

  const rows: SnapchatPerfRow[] = [];
  let periodFrom: string | null = null;
  let periodTo: string | null = null;

  for (let r = header.rowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r] ?? [];
    if (row.length === 0) continue;
    const allEmpty = row.every(
      (c) => c == null || String(c).trim() === "",
    );
    if (allEmpty) continue;

    // Date: l'export Snapchat e' tipicamente weekly aggregato
    // (no daily). Proviamo prima reporting_starts, poi
    // estraiamo la data approssimativa dalla week (es "Week 16
    // 2026" → 2026 W16 monday). Per l'aggregator non serve la
    // data esatta — il time-series usa la date come bucketing.
    const startsValue = get(row, "reporting_starts");
    let date: string | null = startsValue ? parseDate(startsValue) : null;

    const weekRaw = get(row, "week");
    const week =
      weekRaw == null || String(weekRaw).trim() === ""
        ? null
        : String(weekRaw).trim().toLowerCase().replace(/\s+/g, " ");

    // Se non abbiamo reporting_starts ma abbiamo "week 16",
    // ricostruiamo il lunedi' ISO della week (helper condiviso
    // con meta-parser per coerenza tra i canali).
    if (!date && week) {
      date = isoWeekToMonday(week);
    }
    if (!date) continue;

    if (periodFrom == null || date < periodFrom) periodFrom = date;
    if (periodTo == null || date > periodTo) periodTo = date;

    const rawData: Record<string, unknown> = {};
    header.headers.forEach((h, idx) => {
      if (h) rawData[h] = row[idx];
    });

    rows.push({
      date,
      week,
      campaign_name: get(row, "campaign_name")
        ? String(get(row, "campaign_name"))
        : null,
      campaign_id: get(row, "campaign_id")
        ? String(get(row, "campaign_id"))
        : null,
      ad_set_name: get(row, "ad_set_name")
        ? String(get(row, "ad_set_name"))
        : null,
      ad_set_id: get(row, "ad_set_id") ? String(get(row, "ad_set_id")) : null,
      ad_name: get(row, "ad_name") ? String(get(row, "ad_name")) : null,
      ad_id: get(row, "ad_id") ? String(get(row, "ad_id")) : null,
      creative_id: get(row, "creative_id")
        ? String(get(row, "creative_id"))
        : null,
      amount_spent: parseLocalNumber(get(row, "amount_spent")) ?? 0,
      paid_impressions: i(get(row, "paid_impressions")),
      clicks: i(get(row, "clicks")),
      landing_page_views: i(get(row, "landing_page_views")),
      adds_to_cart: parseLocalNumber(get(row, "adds_to_cart")) ?? 0,
      purchases: parseLocalNumber(get(row, "purchases")) ?? 0,
      purchase_value: parseLocalNumber(get(row, "purchase_value")) ?? 0,
      creative_type: get(row, "creative_type")
        ? String(get(row, "creative_type")).toLowerCase().trim()
        : null,
      creative_count: parseLocalNumber(get(row, "creative_count")) ?? null,
      raw_data: rawData,
    });
  }

  if (rows.length === 0 && !diagnostics.some((d) => d.severity === "error")) {
    diagnostics.push({
      severity: "error",
      code: "no_data_rows",
      message:
        "File parsato ma nessuna riga utile trovata. Verifica che l'export contenga settimane con dati.",
    });
  }

  return {
    rows,
    detectedColumns,
    periodFrom,
    periodTo,
    currency: null, // Snapchat: currency e' fornita dal payload upload
    diagnostics,
  };
}
