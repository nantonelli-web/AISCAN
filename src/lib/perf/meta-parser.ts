/**
 * Meta export parser — handles CSV (papaparse) and XLSX (exceljs).
 *
 * Meta Ads Manager export quirks:
 * 1. Sometimes prepends summary rows before the actual header row;
 *    we scan first 10 rows for known column names to find the header.
 * 2. Locale-dependent labels — Italian export has "Importo speso"
 *    instead of "Amount spent". We maintain a synonym dictionary.
 * 3. Numbers in IT locale use comma as decimal separator and dot as
 *    thousand separator; opposite in EN. parseLocalNumber handles both.
 * 4. Currency can appear as a separate column or be embedded in the
 *    "Amount spent" cell ("€ 1.234,56"). We strip symbols and resolve
 *    currency from the explicit column when available.
 * 5. Some columns are reported with multiple synonyms across export
 *    versions (e.g. "Day" vs "Reporting starts" + "Reporting ends").
 *
 * The parser is deliberately permissive on input formats and strict
 * on output schema: every returned row matches MetaPerfRow exactly.
 */

import Papa from "papaparse";
import ExcelJS from "exceljs";
import type {
  MetaPerfRow,
  MetaParseResult,
  PerfDiagnostic,
} from "@/types/perf";

/* ─── Column synonyms ─────────────────────────────────────────
 * Map normalised key → array of possible source column names
 * (case-insensitive, trimmed). Each canonical key resolves to
 * the FIRST source column that matches.
 * IT translations cover Meta's Italian export. */
const COLUMN_SYNONYMS: Record<string, string[]> = {
  // Identity
  campaign_name: [
    "campaign name",
    "nome della campagna",
    "nome campagna",
  ],
  campaign_id: ["campaign id", "id campagna"],
  ad_set_name: [
    "ad set name",
    "nome del gruppo di inserzioni",
    "nome gruppo di inserzioni",
  ],
  ad_set_id: ["ad set id", "id gruppo di inserzioni"],
  ad_name: [
    "ad name",
    "nome dell'inserzione",
    "nome inserzione",
  ],
  ad_id: ["ad id", "id inserzione"],
  // Strategy
  objective: ["objective", "obiettivo"],
  buying_type: ["buying type", "tipo di acquisto"],
  // Dates — Meta exports either a single "Day" column or
  // explicit "Reporting starts" / "Reporting ends" columns.
  day: [
    "day",
    "data",
    "giorno",
    "reporting starts",
    "inizio del periodo di rendicontazione",
    "inizio del rendiconto",
  ],
  // Week — esportata in granularita' settimanale (es. "week 14").
  // Permette confronti week-vs-week reali nel dashboard.
  week: ["week", "settimana"],
  reporting_starts: [
    "reporting starts",
    "inizio del periodo di rendicontazione",
    "inizio del rendiconto",
  ],
  reporting_ends: [
    "reporting ends",
    "fine del periodo di rendicontazione",
    "fine del rendiconto",
  ],
  // Spend + currency
  amount_spent: [
    "amount spent (usd)",
    "amount spent (eur)",
    "amount spent (gbp)",
    "amount spent",
    "importo speso (eur)",
    "importo speso (usd)",
    "importo speso",
    "spesa",
  ],
  currency: ["currency", "valuta"],
  // Volume
  impressions: ["impressions", "impression", "impressioni"],
  reach: ["reach", "copertura"],
  frequency: ["frequency", "frequenza"],
  clicks: ["clicks (all)", "clicks", "clic", "clic (totali)", "clic totali"],
  link_clicks: ["link clicks", "clic sul link", "clic sui link"],
  unique_clicks: ["unique clicks (all)", "unique clicks", "clic univoci"],
  unique_link_clicks: ["unique link clicks", "clic univoci sui link"],
  // Rate
  ctr: ["ctr (all)", "ctr", "ctr (clic totali)"],
  link_ctr: [
    "ctr (link click-through rate)",
    "ctr (percentuale di clic sul link)",
    "ctr link",
  ],
  cpm: [
    "cpm (cost per 1,000 impressions)",
    "cpm (cost per 1.000 impressions)",
    "cpm",
    "costo per 1.000 impression",
  ],
  cpc: ["cpc (all)", "cpc", "cpc (costo per clic totali)"],
  link_cpc: ["cpc (cost per link click)", "cpc per clic sul link"],
  // Outcomes
  results: ["results", "risultati"],
  result_indicator: ["result indicator", "indicatore di risultato"],
  cost_per_result: ["cost per result", "costo per risultato"],
  purchase_roas: [
    "website purchase roas (return on ad spend)",
    "purchase roas (return on ad spend)",
    "purchase roas",
    "roas",
    "roas (return on ad spend)",
    "roas (ritorno sulla spesa pubblicitaria)",
  ],
  purchases: [
    "website purchases",
    "purchases",
    "acquisti",
    "acquisti (sito web)",
  ],
  purchase_value: [
    // Singular + plural forms — i file Meta esportano sia
    // "Purchase conversion value" sia "Purchases conversion value"
    // a seconda dello schema scelto / colonna selezionata. Tenere
    // entrambe.
    "website purchases conversion value",
    "website purchase conversion value",
    "purchases conversion value",
    "purchase conversion value",
    "purchases value",
    "purchase value",
    "valore di conversione degli acquisti",
    "valore acquisti sul sito web",
  ],
  // Quality
  quality_ranking: ["quality ranking", "classifica qualità"],
  engagement_rate_ranking: [
    "engagement rate ranking",
    "classifica del tasso di interazione",
  ],
  conversion_rate_ranking: [
    "conversion rate ranking",
    "classifica del tasso di conversione",
  ],
  // Creative metadata custom (some agencies append these to their
  // exports manually; optional in the standard Meta export).
  creative_type: [
    "creative type",
    "creative_type",
    "tipo creatività",
    "tipo creativita",
    "tipo asset",
    "asset type",
    "format type",
  ],
  creative_count: [
    "num. creatività",
    "num creatività",
    "num. creativita",
    "num creativita",
    "creative count",
    "num creatives",
    "asset count",
  ],
};

/* ─── Helpers ─────────────────────────────────────────────── */

/** Lowercase + trim + collapse whitespace for synonym matching.
 *  Strip trailing `(XXX)` SOLO se il contenuto e' un codice
 *  currency-like (3 lettere) — copre "Amount spent (AED)",
 *  "CPM (cost per 1,000 impressions) (AED)" senza intaccare
 *  "CTR (link click-through rate)" (description, da NON
 *  strippare). Bug 2026-05-08: la strip universale faceva
 *  collassare link_ctr su ctr, propagando valori sbagliati. */
function normHeader(h: string): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*[a-z]{3}\s*\)\s*$/i, "");
}

/** Estrae il codice currency 3-letter da un header tipo "Amount
 *  spent (AED)" → "AED". Ritorna null se non c'e' o non e' un
 *  codice ISO 4217 plausibile (3 lettere maiuscole). */
function extractCurrencyFromHeader(h: string): string | null {
  const m = /\(([A-Z]{3})\)\s*$/i.exec(String(h ?? ""));
  return m ? m[1].toUpperCase() : null;
}

/** Parse number tolerant to IT/EN locale.
 *  IT: "1.234,56" → 1234.56; "12,5%" → 12.5
 *  EN: "1,234.56" → 1234.56; "12.5%" → 12.5
 *  Currency symbols / spaces stripped. Empty / non-numeric → null. */
export function parseLocalNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  // Strip currency symbols and percent
  s = s.replace(/[€$£¥%\s]/g, "");
  if (!s) return null;
  // Detect locale: if last separator is "," and any "." appears
  // before, it's IT (1.234,56). If last separator is "." and any
  // "," before, it's EN (1,234.56). If single separator, infer
  // by position (3-digit grouping = thousand sep).
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      // IT: "1.234,56" → strip dots, replace comma with dot
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // EN: "1,234.56" → strip commas
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    // Only commas — IT decimal or EN thousands. Heuristic: if
    // exactly 3 digits after last comma → thousand sep (EN).
    const after = s.length - 1 - lastComma;
    if (after === 3 && s.length > 4) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
  }
  // dotsuit only or no separator → as-is
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse "1,234" or "1.234" → integer, return 0 on failure. */
function parseInt0(raw: unknown): number {
  const n = parseLocalNumber(raw);
  return n == null ? 0 : Math.round(n);
}

/** Parse date in many formats. Returns YYYY-MM-DD or null. */
export function parseDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    if (!Number.isFinite(raw.getTime())) return null;
    const y = raw.getUTCFullYear();
    const m = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  // ISO 2026-04-15
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // EN US: 04/15/2026
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    const month = m[1].padStart(2, "0");
    const day = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }
  // IT EU: 15/04/2026 (ambiguous with EN; we pick IT first when
  // first num > 12 — clearly day, not month)
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m && Number.parseInt(m[1], 10) > 12) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }
  // Fallback Date.parse
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) {
    const y = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  return null;
}

/* ─── Header detection ─────────────────────────────────────── */

interface DetectedHeader {
  rowIndex: number; // 0-based index of the header row
  headers: string[]; // raw header values in original casing
  colMap: Record<string, number>; // normalised key → column index
}

function detectHeader(rows: unknown[][]): DetectedHeader | null {
  // Scan first 10 rows for one that matches at least 4 of our
  // canonical keys. Meta sometimes prepends 1-3 summary rows.
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

/* ─── Read CSV / XLSX into rows[][] ─────────────────────────── */

async function readCsv(buffer: Buffer): Promise<unknown[][]> {
  const text = buffer.toString("utf8").replace(/^﻿/, ""); // strip BOM
  const result = Papa.parse<unknown[]>(text, {
    skipEmptyLines: true,
  });
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
      // ExcelJS gives us typed values: Date, Number, String, etc.
      // For numeric cells with a formula, value is { result } object.
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

/* ─── Public entry point ───────────────────────────────────── */

export async function parseMetaExport(
  buffer: Buffer,
  filename: string,
): Promise<MetaParseResult> {
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
        "Could not detect the header row. Make sure the file is a Meta Ads Manager export with column names like 'Campaign name', 'Day', 'Amount spent', 'Impressions'.",
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

  // Required columns check
  const requiredKeys = ["amount_spent", "impressions"];
  const requiredDate =
    "day" in header.colMap ||
    ("reporting_starts" in header.colMap &&
      "reporting_ends" in header.colMap);
  const missingRequired: string[] = [];
  for (const req of requiredKeys) {
    if (!(req in header.colMap)) missingRequired.push(req);
  }
  if (!requiredDate) missingRequired.push("day or reporting_starts/ends");
  if (!("campaign_name" in header.colMap)) {
    missingRequired.push("campaign_name");
  }
  if (missingRequired.length > 0) {
    diagnostics.push({
      severity: "error",
      code: "missing_required_columns",
      message: `Missing required columns: ${missingRequired.join(", ")}`,
      context: { missing: missingRequired },
    });
  }

  const get = (row: unknown[], key: string): unknown => {
    const idx = header.colMap[key];
    return idx == null ? undefined : row[idx];
  };

  // ── Currency detection from column header ──
  // Some Meta exports have no explicit "Currency" column but
  // suffix the amount/CPM/CPC columns with the ISO code, es.
  // "Amount spent (AED)". Estraggo qui dal nome del column
  // Amount-spent — fallback usato quando la colonna Currency
  // esplicita non c'e' nel file.
  let currencyFromHeader: string | null = null;
  if ("amount_spent" in header.colMap) {
    const ix = header.colMap.amount_spent;
    currencyFromHeader = extractCurrencyFromHeader(
      header.headers[ix] ?? "",
    );
  }

  // Iterate data rows
  const rows: MetaPerfRow[] = [];
  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  let reportingEndsMax: string | null = null;
  let currency: string | null = null;
  const currencySet = new Set<string>();

  for (let i = header.rowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i] ?? [];
    if (row.length === 0) continue;
    // Skip empty rows (all cells null/empty)
    const allEmpty = row.every(
      (c) => c == null || String(c).trim() === "",
    );
    if (allEmpty) continue;

    // Date — prefer explicit Day column; fallback to Reporting starts
    const dayValue = get(row, "day") ?? get(row, "reporting_starts");
    const date = parseDate(dayValue);
    if (!date) continue; // can't bucket without a date — skip silently

    if (periodFrom == null || date < periodFrom) periodFrom = date;
    if (periodTo == null || date > periodTo) periodTo = date;

    // For week/month-aggregated exports, Reporting ends e' >
    // Reporting starts; teniamo traccia del max per usare quello
    // come period_to (vero ultimo giorno coperto dal file).
    const endsValue = get(row, "reporting_ends");
    if (endsValue != null) {
      const endsDate = parseDate(endsValue);
      if (endsDate) {
        if (reportingEndsMax == null || endsDate > reportingEndsMax) {
          reportingEndsMax = endsDate;
        }
      }
    }

    // Currency
    const cur = get(row, "currency");
    if (cur && String(cur).trim()) {
      const c = String(cur).trim().toUpperCase();
      currencySet.add(c);
      if (currency == null) currency = c;
    }

    const rawData: Record<string, unknown> = {};
    header.headers.forEach((h, idx) => {
      if (h) rawData[h] = row[idx];
    });

    // Week: se presente, normalizziamo lowercase + collapse spaces.
    // Manteniamo il formato originale ("week 14") per UX coerente
    // con il file Meta.
    const weekRaw = get(row, "week");
    const week =
      weekRaw == null || String(weekRaw).trim() === ""
        ? null
        : String(weekRaw).trim().toLowerCase().replace(/\s+/g, " ");

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
      objective: get(row, "objective") ? String(get(row, "objective")) : null,
      buying_type: get(row, "buying_type")
        ? String(get(row, "buying_type"))
        : null,
      amount_spent: parseLocalNumber(get(row, "amount_spent")) ?? 0,
      impressions: parseInt0(get(row, "impressions")),
      reach: parseInt0(get(row, "reach")),
      frequency: parseLocalNumber(get(row, "frequency")),
      clicks: parseInt0(get(row, "clicks")),
      link_clicks: parseInt0(get(row, "link_clicks")),
      unique_clicks: parseInt0(get(row, "unique_clicks")),
      unique_link_clicks: parseInt0(get(row, "unique_link_clicks")),
      ctr: parseLocalNumber(get(row, "ctr")),
      link_ctr: parseLocalNumber(get(row, "link_ctr")),
      cpm: parseLocalNumber(get(row, "cpm")),
      cpc: parseLocalNumber(get(row, "cpc")),
      link_cpc: parseLocalNumber(get(row, "link_cpc")),
      results: parseLocalNumber(get(row, "results")),
      result_indicator: get(row, "result_indicator")
        ? String(get(row, "result_indicator"))
        : null,
      cost_per_result: parseLocalNumber(get(row, "cost_per_result")),
      purchase_roas: parseLocalNumber(get(row, "purchase_roas")),
      purchases: parseLocalNumber(get(row, "purchases")),
      purchase_value: parseLocalNumber(get(row, "purchase_value")),
      quality_ranking: get(row, "quality_ranking")
        ? String(get(row, "quality_ranking"))
        : null,
      engagement_rate_ranking: get(row, "engagement_rate_ranking")
        ? String(get(row, "engagement_rate_ranking"))
        : null,
      conversion_rate_ranking: get(row, "conversion_rate_ranking")
        ? String(get(row, "conversion_rate_ranking"))
        : null,
      creative_type: get(row, "creative_type")
        ? String(get(row, "creative_type")).toLowerCase().trim()
        : null,
      creative_count: parseLocalNumber(get(row, "creative_count")) ?? null,
      raw_data: rawData,
    });
  }

  // Currency: prefer explicit "Currency" column, fallback to
  // suffix on Amount spent column (es. "Amount spent (AED)").
  if (currency == null && currencyFromHeader) {
    currency = currencyFromHeader;
  }

  // Currency consistency
  if (currencySet.size > 1) {
    diagnostics.push({
      severity: "error",
      code: "multiple_currencies",
      message: `File contains multiple currencies (${[...currencySet].join(", ")}). Meta exports a single currency per ad account.`,
      context: { currencies: [...currencySet] },
    });
  }

  // Use reporting_ends max as period_to when available — gives
  // the "true" last-day-covered for week/month-aggregated exports.
  if (reportingEndsMax && (periodTo == null || reportingEndsMax > periodTo)) {
    periodTo = reportingEndsMax;
  }

  if (rows.length === 0 && !diagnostics.some((d) => d.severity === "error")) {
    diagnostics.push({
      severity: "error",
      code: "no_data_rows",
      message:
        "The file was parsed but no data rows were found. Verify the export covers a non-empty period.",
    });
  }

  return {
    rows,
    detectedColumns,
    periodFrom,
    periodTo,
    currency,
    diagnostics,
  };
}
