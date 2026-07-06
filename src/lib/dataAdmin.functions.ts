// Server functions administrativas: sincronización desde Google Sheets (via connector gateway),
// reversión de cargas y borrado total. Bypass RLS con supabaseAdmin.
// NOTA: sin auth — panel interno. Endurecer con requireSupabaseAuth + roles si se abre al público.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ---------- Fuentes ----------
export interface SheetSource {
  key: string;
  label: string;
  spreadsheetId: string;
  technology: "hidro" | "eolico" | "solar" | "termico" | "otro";
  system: "SEIN" | "COES" | "AISLADO" | "OTRO";
}

export const SHEETS_SOURCES: SheetSource[] = [
  { key: "solar",        label: "CENTRAL_SOLAR",                 spreadsheetId: "18UWymB-eeilBibyusR4imyEYqteUMSBRD8nlQ5mKKa4", technology: "solar",   system: "SEIN" },
  { key: "hidro_norte",  label: "CENTRAL_HIDROELECTRICA_NORTE",  spreadsheetId: "1y1cSwjPJlQAdrfWUsDsz7AQp--KjUdnojdbTZuD7kyQ", technology: "hidro",   system: "SEIN" },
  { key: "hidro_centro", label: "CENTRAL_HIDROELECTRICA_CENTRO", spreadsheetId: "1Np13da5433VxwD2RpmV51IxvvenD5jpD6el8Uk63MDo", technology: "hidro",   system: "SEIN" },
  { key: "hidro_sur",    label: "CENTRAL_HIDROELECTRICA_SUR",    spreadsheetId: "1DY2ufcHSd-JbgIoZ4UTJRbfljT5XjALI1agwLKIcTS4", technology: "hidro",   system: "SEIN" },
  { key: "eolicas",      label: "CENTRALES_EOLICAS",             spreadsheetId: "1MFqBjijNoP97CaSejkycF06PNub3DnKev7hbLTSdbz4", technology: "eolico",  system: "SEIN" },
  { key: "datos",        label: "DATOS_CENTRALES",               spreadsheetId: "1MG4ddVNqfHlTgd7MTwAkSq05HvK4WvMGhbPd9Fu90J4", technology: "otro",    system: "SEIN" },
  { key: "termicas",     label: "CENTRALES_TERMICAS",            spreadsheetId: "1Sk5HYmCHoNIe8AKG_IHIFl_-2GobWwi6bEVnEb5qUvM", technology: "termico", system: "SEIN" },
];

// ---------- Utilidades ----------
const COL_ALIASES = {
  code: ["codigo", "código", "code", "cod", "central_id", "id"],
  name: ["nombre", "name", "central", "planta"],
  date: ["fecha", "date", "dia", "día"],
  mw:   ["mw", "potencia", "valor", "generacion", "generación", "energia", "energía"],
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function toISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ---------- Google Sheets vía Lovable Gateway ----------
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

async function gsFetch(path: string): Promise<any> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error("Faltan LOVABLE_API_KEY o GOOGLE_SHEETS_API_KEY. Reconecta el conector Google Sheets.");
  }
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google Sheets ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function listSheetTitles(spreadsheetId: string): Promise<string[]> {
  const data = await gsFetch(`/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`);
  return (data?.sheets ?? []).map((s: any) => s?.properties?.title).filter(Boolean);
}

async function readSheetValues(spreadsheetId: string, title: string): Promise<string[][]> {
  const range = `${title}!A1:ZZ200000`;
  const data = await gsFetch(`/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  return (data?.values ?? []) as string[][];
}

// ---------- Parseo genérico ----------
interface ParsedRow { plantCode: string; plantName: string; date: string; mw: number; }

function parseSheet(values: string[][]): ParsedRow[] {
  if (!values || values.length < 2) return [];
  const header = values[0].map((h) => (h ?? "").toString());
  const headerLc = header.map(normalize);

  const findIdx = (aliases: string[]) => headerLc.findIndex((h) => aliases.includes(h));
  const iCode = findIdx(COL_ALIASES.code);
  const iName = findIdx(COL_ALIASES.name);
  const iDate = findIdx(COL_ALIASES.date);
  const iMw   = findIdx(COL_ALIASES.mw);

  const rows: ParsedRow[] = [];

  // Formato LARGO: código + fecha + mw
  if (iCode >= 0 && iDate >= 0 && iMw >= 0) {
    for (let r = 1; r < values.length; r++) {
      const row = values[r] ?? [];
      const code = String(row[iCode] ?? "").trim();
      const iso = toISO(row[iDate]);
      const n = toNumber(row[iMw]);
      if (!code || !iso || n == null) continue;
      const name = iName >= 0 ? String(row[iName] ?? code).trim() || code : code;
      rows.push({ plantCode: code.toUpperCase().slice(0, 32), plantName: name, date: iso, mw: n });
    }
    return rows;
  }

  // Formato ANCHO: fecha + una columna por central
  if (iDate >= 0) {
    const dataCols: number[] = [];
    for (let c = 0; c < header.length; c++) if (c !== iDate && header[c]?.trim()) dataCols.push(c);
    for (let r = 1; r < values.length; r++) {
      const row = values[r] ?? [];
      const iso = toISO(row[iDate]);
      if (!iso) continue;
      for (const c of dataCols) {
        const n = toNumber(row[c]);
        if (n == null) continue;
        const label = header[c].trim();
        const code = label.toUpperCase().replace(/\s+/g, "_").slice(0, 32);
        rows.push({ plantCode: code, plantName: label, date: iso, mw: n });
      }
    }
    return rows;
  }

  return [];
}

// ---------- Escritura a la base ----------
async function insertParsedRows(
  src: SheetSource,
  sheetTitle: string,
  parsed: ParsedRow[],
): Promise<{ inserted: number; plants: number }> {
  if (!parsed.length) return { inserted: 0, plants: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Upsert de centrales por código
  const uniq = new Map<string, string>();
  for (const r of parsed) if (r.plantCode) uniq.set(r.plantCode, r.plantName || r.plantCode);
  const codes = Array.from(uniq.keys());

  const { data: existing, error: eSel } = await supabaseAdmin
    .from("plants").select("id,code").in("code", codes);
  if (eSel) throw eSel;

  const codeToId = new Map<string, string>();
  for (const p of existing ?? []) codeToId.set(p.code as string, p.id as string);

  const missing = codes.filter((c) => !codeToId.has(c));
  if (missing.length) {
    const { data: ins, error: eIns } = await supabaseAdmin
      .from("plants")
      .insert(missing.map((c) => ({
        code: c, name: uniq.get(c) ?? c,
        technology: src.technology, system: src.system,
      })))
      .select("id,code");
    if (eIns) throw eIns;
    for (const p of ins ?? []) codeToId.set(p.code as string, p.id as string);
  }

  // Crear registro de carga
  const { data: upRow, error: eUp } = await supabaseAdmin
    .from("data_uploads")
    .insert({
      technology: src.technology,
      filename: `[GSheets] ${src.label} / ${sheetTitle}`,
      rows_inserted: 0,
      plants_touched: codeToId.size,
    })
    .select("id").single();
  if (eUp) throw eUp;
  const uploadId = upRow.id as string;

  const measurements = parsed
    .map((r) => ({
      plant_id: codeToId.get(r.plantCode),
      date: r.date,
      mw: r.mw,
      upload_id: uploadId,
    }))
    .filter((m) => m.plant_id) as Array<{ plant_id: string; date: string; mw: number; upload_id: string }>;

  const CHUNK = 800;
  let inserted = 0;
  for (let i = 0; i < measurements.length; i += CHUNK) {
    const slice = measurements.slice(i, i + CHUNK);
    const { error } = await supabaseAdmin.from("measurements").insert(slice);
    if (error) throw error;
    inserted += slice.length;
  }

  await supabaseAdmin
    .from("data_uploads")
    .update({ rows_inserted: inserted })
    .eq("id", uploadId);

  return { inserted, plants: codeToId.size };
}

// ---------- Server functions expuestas ----------

export const syncSheetSource = createServerFn({ method: "POST" })
  .inputValidator((d: { key: string }) => z.object({ key: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const src = SHEETS_SOURCES.find((s) => s.key === data.key);
    if (!src) throw new Error(`Fuente desconocida: ${data.key}`);
    const titles = await listSheetTitles(src.spreadsheetId);
    if (!titles.length) throw new Error(`No se encontraron pestañas en ${src.label}. Verifica permisos del Google Sheet.`);

    const detail: Array<{ sheet: string; status: "ok" | "empty" | "error"; rows?: number; message?: string }> = [];
    let totalInserted = 0;

    for (const title of titles) {
      try {
        const values = await readSheetValues(src.spreadsheetId, title);
        const parsed = parseSheet(values);
        if (!parsed.length) {
          detail.push({ sheet: title, status: "empty" });
          continue;
        }
        const { inserted } = await insertParsedRows(src, title, parsed);
        totalInserted += inserted;
        detail.push({ sheet: title, status: "ok", rows: inserted });
      } catch (err) {
        detail.push({ sheet: title, status: "error", message: (err as Error).message });
      }
    }

    return { source: src.label, inserted: totalInserted, sheets: titles.length, detail };
  });

export const syncAllSources = createServerFn({ method: "POST" }).handler(async () => {
  const all: Array<{ source: string; inserted: number; sheets: number; detail: any[] }> = [];
  let total = 0;
  for (const src of SHEETS_SOURCES) {
    try {
      const titles = await listSheetTitles(src.spreadsheetId);
      const detail: Array<{ sheet: string; status: "ok" | "empty" | "error"; rows?: number; message?: string }> = [];
      let inserted = 0;
      for (const title of titles) {
        try {
          const values = await readSheetValues(src.spreadsheetId, title);
          const parsed = parseSheet(values);
          if (!parsed.length) { detail.push({ sheet: title, status: "empty" }); continue; }
          const r = await insertParsedRows(src, title, parsed);
          inserted += r.inserted;
          detail.push({ sheet: title, status: "ok", rows: r.inserted });
        } catch (err) {
          detail.push({ sheet: title, status: "error", message: (err as Error).message });
        }
      }
      all.push({ source: src.label, inserted, sheets: titles.length, detail });
      total += inserted;
    } catch (err) {
      all.push({ source: src.label, inserted: 0, sheets: 0, detail: [{ sheet: "-", status: "error", message: (err as Error).message }] });
    }
  }
  return { total, sources: all };
});

export const revertUploadAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { uploadId: string }) => z.object({ uploadId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e1, count } = await supabaseAdmin
      .from("measurements")
      .delete({ count: "exact" })
      .eq("upload_id", data.uploadId);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin
      .from("data_uploads")
      .update({ reverted_at: new Date().toISOString() })
      .eq("id", data.uploadId);
    if (e2) throw new Error(e2.message);
    return { deleted: count ?? 0 };
  });

export const wipeAllMeasurements = createServerFn({ method: "POST" })
  .inputValidator((d: { confirm: string }) => z.object({ confirm: z.literal("BORRAR TODO") }).parse(d))
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e1, count: mCount } = await supabaseAdmin
      .from("measurements").delete({ count: "exact" }).neq("plant_id", "00000000-0000-0000-0000-000000000000");
    if (e1) throw new Error(e1.message);
    const { error: e2, count: uCount } = await supabaseAdmin
      .from("data_uploads").delete({ count: "exact" }).neq("id", "00000000-0000-0000-0000-000000000000");
    if (e2) throw new Error(e2.message);
    return { measurementsDeleted: mCount ?? 0, uploadsDeleted: uCount ?? 0 };
  });

export const getDataStats = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ count: mCount }, { count: pCount }, { data: last }] = await Promise.all([
    supabaseAdmin.from("measurements").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("plants").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("data_uploads").select("uploaded_at").order("uploaded_at", { ascending: false }).limit(1),
  ]);
  return {
    measurements: mCount ?? 0,
    plants: pCount ?? 0,
    lastUpload: last?.[0]?.uploaded_at ?? null,
  };
});
