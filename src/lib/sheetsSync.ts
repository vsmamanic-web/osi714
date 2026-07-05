// Sincronización desde Google Sheets públicos (formato gviz CSV).
// Los libros deben estar en modo "Cualquiera con el enlace: Lector".
// Cada libro tiene hojas nombradas por año (ej. "2023", "2024"). Formato esperado:
// columnas: codigo, nombre, fecha, mw   (nombres flexibles, ver COLS).

import Papa from "papaparse";
import type { System, Technology } from "@/lib/centrales";
import { uploadMeasurements } from "@/lib/centrales";

export interface SheetSource {
  key: string;
  label: string;
  spreadsheetId: string;
  technology: Technology;
  system: System;
}

export const SHEETS_SOURCES: SheetSource[] = [
  { key: "solar",       label: "CENTRAL_SOLAR",                spreadsheetId: "18UWymB-eeilBibyusR4imyEYqteUMSBRD8nlQ5mKKa4", technology: "solar",   system: "SEIN" },
  { key: "hidro_norte", label: "CENTRAL_HIDROELECTRICA_NORTE", spreadsheetId: "1y1cSwjPJlQAdrfWUsDsz7AQp--KjUdnojdbTZuD7kyQ", technology: "hidro",   system: "SEIN" },
  { key: "hidro_centro",label: "CENTRAL_HIDROELECTRICA_CENTRO",spreadsheetId: "1Np13da5433VxwD2RpmV51IxvvenD5jpD6el8Uk63MDo", technology: "hidro",   system: "SEIN" },
  { key: "hidro_sur",   label: "CENTRAL_HIDROELECTRICA_SUR",   spreadsheetId: "1DY2ufcHSd-JbgIoZ4UTJRbfljT5XjALI1agwLKIcTS4", technology: "hidro",   system: "SEIN" },
  { key: "eolicas",     label: "CENTRALES_EOLICAS",            spreadsheetId: "1MFqBjijNoP97CaSejkycF06PNub3DnKev7hbLTSdbz4", technology: "eolico",  system: "SEIN" },
  { key: "datos",       label: "DATOS_CENTRALES",              spreadsheetId: "1MG4ddVNqfHlTgd7MTwAkSq05HvK4WvMGhbPd9Fu90J4", technology: "otro",    system: "SEIN" },
  { key: "termicas",    label: "CENTRALES_TERMICAS",           spreadsheetId: "1Sk5HYmCHoNIe8AKG_IHIFl_-2GobWwi6bEVnEb5qUvM", technology: "termico", system: "SEIN" },
];

const COL_ALIASES = {
  code: ["codigo","código","code","cod","central_id"],
  name: ["nombre","name","central","planta"],
  date: ["fecha","date","dia","día"],
  mw:   ["mw","potencia","valor","generacion","generación","energia","energía"],
};

function findKey(row: Record<string, unknown>, aliases: string[]): string | null {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const k = keys.find((k) => k.trim().toLowerCase() === alias);
    if (k) return k;
  }
  return null;
}

function toISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

async function fetchSheetNames(spreadsheetId: string): Promise<string[]> {
  // gviz responde con `/*O_o*/\ngoogle.visualization.Query.setResponse({...});`
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`;
  const res = await fetch(url);
  const text = await res.text();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]);
    // gviz solo lista una hoja por request; usamos fallback: probamos años recientes.
    return obj?.sig ? [] : [];
  } catch { return []; }
}

async function fetchSheetCSV(spreadsheetId: string, sheetName: string): Promise<string | null> {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  if (text.startsWith("<")) return null; // HTML error page
  return text;
}

export interface SyncProgress {
  source: string;
  sheet: string;
  status: "ok" | "empty" | "error";
  rows?: number;
  message?: string;
}

/** Sincroniza una fuente probando años 2020..currentYear como nombres de hoja. */
export async function syncSource(
  src: SheetSource,
  onProgress?: (p: SyncProgress) => void,
): Promise<{ inserted: number; sheets: number }> {
  await fetchSheetNames(src.spreadsheetId); // reservado para futura enumeración
  const currentYear = new Date().getFullYear();
  const candidateSheets: string[] = [];
  for (let y = 2020; y <= currentYear; y++) candidateSheets.push(String(y));
  candidateSheets.push("Hoja1", "Sheet1"); // fallback

  let totalInserted = 0;
  let sheetsOk = 0;

  for (const sheet of candidateSheets) {
    const csv = await fetchSheetCSV(src.spreadsheetId, sheet);
    if (!csv || csv.trim().length < 5) {
      continue;
    }
    const parsed = Papa.parse<Record<string, unknown>>(csv, { header: true, skipEmptyLines: true });
    if (!parsed.data.length) { continue; }

    const first = parsed.data[0];
    const kCode = findKey(first, COL_ALIASES.code);
    const kName = findKey(first, COL_ALIASES.name);
    const kDate = findKey(first, COL_ALIASES.date);
    const kMw   = findKey(first, COL_ALIASES.mw);

    // Detectar formato ANCHO (una columna por central, sin "codigo"/"mw" pero con "fecha").
    if (!kMw && kDate) {
      const cols = Object.keys(first).filter((c) => c !== kDate);
      const rows: Array<{ plantCode: string; plantName: string; date: string; mw: number }> = [];
      for (const raw of parsed.data) {
        const iso = toISO(raw[kDate]);
        if (!iso) continue;
        for (const c of cols) {
          const v = raw[c];
          const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
          if (!Number.isFinite(n)) continue;
          const code = c.trim().toUpperCase().replace(/\s+/g, "_").slice(0, 32);
          rows.push({ plantCode: code, plantName: c.trim(), date: iso, mw: n });
        }
      }
      if (!rows.length) { onProgress?.({ source: src.label, sheet, status: "empty" }); continue; }
      const { inserted } = await uploadMeasurements({
        technology: src.technology, system: src.system,
        filename: `[GSheets] ${src.label} / ${sheet}`, rows,
      });
      totalInserted += inserted; sheetsOk++;
      onProgress?.({ source: src.label, sheet, status: "ok", rows: inserted });
      continue;
    }

    if (!kCode || !kDate || !kMw) {
      onProgress?.({ source: src.label, sheet, status: "error", message: "columnas no reconocidas" });
      continue;
    }

    const rows: Array<{ plantCode: string; plantName: string; date: string; mw: number }> = [];
    for (const raw of parsed.data) {
      const code = String(raw[kCode] ?? "").trim();
      const iso = toISO(raw[kDate]);
      const v = raw[kMw];
      const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
      if (!code || !iso || !Number.isFinite(n)) continue;
      rows.push({
        plantCode: code,
        plantName: kName ? String(raw[kName] ?? code).trim() || code : code,
        date: iso, mw: n,
      });
    }
    if (!rows.length) { onProgress?.({ source: src.label, sheet, status: "empty" }); continue; }
    const { inserted } = await uploadMeasurements({
      technology: src.technology, system: src.system,
      filename: `[GSheets] ${src.label} / ${sheet}`, rows,
    });
    totalInserted += inserted; sheetsOk++;
    onProgress?.({ source: src.label, sheet, status: "ok", rows: inserted });
  }

  return { inserted: totalInserted, sheets: sheetsOk };
}

export async function syncAll(onProgress?: (p: SyncProgress) => void) {
  let total = 0;
  for (const src of SHEETS_SOURCES) {
    const { inserted } = await syncSource(src, onProgress);
    total += inserted;
  }
  return total;
}
