// Capa de acceso a datos (cliente Supabase / Lovable Cloud).
// Panel interno sin auth — políticas permisivas intencionales.

import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export type Technology = "hidro" | "eolico" | "solar" | "termico" | "otro";
export type System = "SEIN" | "COES" | "AISLADO" | "OTRO";
export type Granularity = "day" | "week" | "month";

export interface Plant {
  id: string;
  code: string;
  name: string;
  technology: Technology;
  system: System;
  company: string | null;
  region: string | null;
  installed_mw: number | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
}

export interface Measurement {
  plant_id: string;
  date: string;
  mw: number;
}

export interface UploadRow {
  id: string;
  technology: string;
  filename: string | null;
  rows_inserted: number;
  plants_touched: number;
  uploaded_at: string;
  reverted_at: string | null;
}

export const TECH_LABEL: Record<Technology, string> = {
  hidro: "Hidroeléctrica",
  eolico: "Eólica",
  solar: "Solar",
  termico: "Térmica",
  otro: "Otro",
};

// Paleta Osinergmin Institucional por defecto (azul institucional + complementarios oficiales).
export const DEFAULT_TECH_COLOR: Record<Technology, string> = {
  hidro: "#00559E",     // azul institucional
  eolico: "#00B6F1",    // turquesa / celeste
  solar: "#FFD400",     // amarillo
  termico: "#F39F30",   // naranja
  otro: "#7DA9DD",      // celeste claro
};

export const TECH_COLOR = DEFAULT_TECH_COLOR;

export const SYSTEM_LABEL: Record<System, string> = {
  SEIN: "SEIN",
  COES: "COES",
  AISLADO: "Aislado",
  OTRO: "Otro",
};

export const IN_SEIN: System[] = ["SEIN", "COES"];

export async function listPlants(opts?: { tech?: Technology; system?: System[] }): Promise<Plant[]> {
  let q = supabase.from("plants").select("*").order("name");
  if (opts?.tech) q = q.eq("technology", opts.tech);
  if (opts?.system && opts.system.length) q = q.in("system", opts.system);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Plant[];
}

export async function getMeasurementsByPlant(plantId: string): Promise<Measurement[]> {
  const { data, error } = await supabase
    .from("measurements")
    .select("plant_id,date,mw")
    .eq("plant_id", plantId)
    .order("date");
  if (error) throw error;
  return (data ?? []) as Measurement[];
}

export async function getMeasurementsByPlants(plantIds: string[]): Promise<Measurement[]> {
  if (!plantIds.length) return [];
  const CHUNK = 100;
  const all: Measurement[] = [];
  for (let i = 0; i < plantIds.length; i += CHUNK) {
    const slice = plantIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("measurements")
      .select("plant_id,date,mw")
      .in("plant_id", slice)
      .order("date");
    if (error) throw error;
    all.push(...((data ?? []) as Measurement[]));
  }
  return all;
}

export async function getMeasurementsByTech(
  tech: Technology,
  opts?: { system?: System[]; from?: string; to?: string },
): Promise<Measurement[]> {
  const plants = await listPlants({ tech, system: opts?.system });
  if (!plants.length) return [];
  const ids = plants.map((p) => p.id);
  const CHUNK = 100;
  const all: Measurement[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    let q = supabase
      .from("measurements")
      .select("plant_id,date,mw")
      .in("plant_id", slice)
      .order("date");
    if (opts?.from) q = q.gte("date", opts.from);
    if (opts?.to) q = q.lte("date", opts.to);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...((data ?? []) as Measurement[]));
  }
  return all;
}

export async function getLastUpdate(): Promise<{
  technology: string;
  uploaded_at: string;
  filename: string | null;
} | null> {
  const { data, error } = await supabase
    .from("data_uploads")
    .select("technology,uploaded_at,filename")
    .is("reverted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function listUploads(limit = 30): Promise<UploadRow[]> {
  const { data, error } = await supabase
    .from("data_uploads")
    .select("id,technology,filename,rows_inserted,plants_touched,uploaded_at,reverted_at")
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as UploadRow[];
}

export async function revertUpload(uploadId: string): Promise<{ deleted: number }> {
  // Borra las mediciones asociadas y marca la carga como revertida.
  const { error: e1, count } = await supabase
    .from("measurements")
    .delete({ count: "exact" })
    .eq("upload_id", uploadId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("data_uploads")
    .update({ reverted_at: new Date().toISOString() })
    .eq("id", uploadId);
  if (e2) throw e2;
  return { deleted: count ?? 0 };
}

// -------- Upload mediciones (matching por CÓDIGO) --------
export async function uploadMeasurements(args: {
  technology: Technology;
  system?: System;
  filename: string;
  rows: Array<{ plantCode: string; plantName: string; date: string; mw: number }>;
}) {
  const { technology, system = "SEIN", filename, rows } = args;
  if (!rows.length) return { inserted: 0, plantsTouched: 0, uploadId: null as string | null };

  const uniq = new Map<string, string>();
  for (const r of rows) {
    const code = r.plantCode.trim();
    if (code) uniq.set(code, r.plantName.trim() || code);
  }
  const codes = Array.from(uniq.keys());

  const { data: existing, error: e1 } = await supabase
    .from("plants")
    .select("id,code")
    .in("code", codes);
  if (e1) throw e1;
  const codeToId = new Map<string, string>();
  for (const p of existing ?? []) codeToId.set(p.code, p.id);

  const missing = codes.filter((c) => !codeToId.has(c));
  if (missing.length) {
    const toInsert = missing.map((c) => ({
      code: c,
      name: uniq.get(c) ?? c,
      technology,
      system,
    }));
    const { data: inserted, error: e2 } = await supabase
      .from("plants")
      .insert(toInsert)
      .select("id,code");
    if (e2) throw e2;
    for (const p of inserted ?? []) codeToId.set(p.code, p.id);
  }

  // Crear registro de carga primero para obtener upload_id.
  const { data: uploadRow, error: eUp } = await supabase
    .from("data_uploads")
    .insert({
      technology,
      filename,
      rows_inserted: 0,
      plants_touched: codeToId.size,
    })
    .select("id")
    .single();
  if (eUp) throw eUp;
  const uploadId = uploadRow.id as string;

  const measurements = rows
    .map((r) => ({
      plant_id: codeToId.get(r.plantCode.trim()),
      date: r.date,
      mw: r.mw,
      upload_id: uploadId,
    }))
    .filter((m) => m.plant_id && m.date && Number.isFinite(m.mw)) as Array<{
    plant_id: string;
    date: string;
    mw: number;
    upload_id: string;
  }>;

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < measurements.length; i += CHUNK) {
    const chunk = measurements.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("measurements")
      .upsert(chunk, { onConflict: "plant_id,date" });
    if (error) throw error;
    inserted += chunk.length;
  }

  await supabase
    .from("data_uploads")
    .update({ rows_inserted: inserted })
    .eq("id", uploadId);

  return { inserted, plantsTouched: codeToId.size, uploadId };
}

// -------- Upload maestro de centrales (coordenadas + metadatos) --------
export async function upsertPlants(rows: Array<Partial<Plant> & { code: string }>) {
  if (!rows.length) return { updated: 0, inserted: 0 };
  const codes = rows.map((r) => r.code.trim()).filter(Boolean);
  const { data: existing } = await supabase.from("plants").select("id,code").in("code", codes);
  const existingCodes = new Set((existing ?? []).map((p) => p.code));

  const toUpdate = rows.filter((r) => existingCodes.has(r.code));
  const toInsert = rows.filter((r) => !existingCodes.has(r.code));

  let updated = 0;
  for (const r of toUpdate) {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "technology", "system", "company", "region", "lat", "lng", "installed_mw"] as const) {
      if (r[k] != null && r[k] !== "") patch[k] = r[k];
    }
    if (Object.keys(patch).length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("plants").update(patch as any).eq("code", r.code);
      if (error) throw error;
      updated++;
    }
  }
  let inserted = 0;
  if (toInsert.length) {
    const payload = toInsert.map((r) => ({
      code: r.code,
      name: r.name ?? r.code,
      technology: (r.technology ?? "otro") as Technology,
      system: (r.system ?? "SEIN") as System,
      company: r.company ?? null,
      region: r.region ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      installed_mw: r.installed_mw ?? null,
    }));
    const { data, error } = await supabase.from("plants").insert(payload).select("id");
    if (error) throw error;
    inserted = data?.length ?? 0;
  }
  return { updated, inserted };
}

// -------- Plantillas Excel descargables --------
export function downloadMeasurementsTemplate() {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const d0 = new Date(today);
  const d1 = new Date(today); d1.setDate(d1.getDate() - 1);
  const d2 = new Date(today); d2.setDate(d2.getDate() - 2);

  const data = [
    ["codigo", "nombre", "fecha", "mw"],
    ["EOL001", "Central Eólica Ejemplo 1", iso(d2), 45.2],
    ["EOL001", "Central Eólica Ejemplo 1", iso(d1), 52.7],
    ["EOL001", "Central Eólica Ejemplo 1", iso(d0), 48.1],
    ["EOL002", "Central Eólica Ejemplo 2", iso(d2), 12.4],
    ["EOL002", "Central Eólica Ejemplo 2", iso(d1), 15.0],
  ];
  const instrucciones = [
    ["PLANTILLA DE MEDICIONES DIARIAS"],
    [""],
    ["Orden y obligatoriedad de columnas:"],
    ["codigo    OBLIGATORIO   Código único de la central (evita duplicados)"],
    ["nombre    Recomendado   Nombre de la central. Se ignora si el código ya existe en el sistema."],
    ["fecha     OBLIGATORIO   Formato YYYY-MM-DD o fecha de Excel"],
    ["mw        OBLIGATORIO   Potencia diaria en MW (numérico, decimales con punto o coma)"],
    [""],
    ["Reglas anti-duplicados:"],
    ["- Si el CÓDIGO ya existe, se actualizan sus mediciones."],
    ["- Si el CÓDIGO no existe, se crea una nueva central con la tecnología y sistema elegidos en el formulario."],
    ["- Dos filas con el mismo código y misma fecha se sobrescriben (última gana)."],
    [""],
    ["Antes de subir asegúrate de que cada central tenga SIEMPRE el mismo código."],
    ["Para revertir una carga usa el botón \"Revertir\" en la tabla de últimas cargas."],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Mediciones");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instrucciones), "Instrucciones");
  XLSX.writeFile(wb, "plantilla_mediciones.xlsx");
}

export function downloadPlantsTemplate() {
  const data = [
    ["codigo", "nombre", "tecnologia", "sistema", "empresa", "region", "potencia_instalada_mw", "lat", "lng"],
    ["EOL001", "Central Eólica Ejemplo 1", "eolico", "SEIN", "Empresa SAC", "Piura", 132.3, -5.1, -80.9],
    ["HID001", "Central Hidro Ejemplo", "hidro", "COES", "Otra Empresa SAC", "Junín", 210.0, -11.2, -75.5],
    ["SOL001", "Solar Ejemplo", "solar", "SEIN", "SolarCo", "Moquegua", 50.0, -17.1, -70.9],
  ];
  const instrucciones = [
    ["PLANTILLA DE CENTRALES (MAESTRO)"],
    [""],
    ["codigo                   OBLIGATORIO"],
    ["nombre                   OBLIGATORIO"],
    ["tecnologia               OBLIGATORIO   Valores: hidro | eolico | solar | termico | otro"],
    ["sistema                  OBLIGATORIO   Valores: SEIN | COES | AISLADO | OTRO"],
    ["empresa                  Opcional"],
    ["region                   Opcional"],
    ["potencia_instalada_mw    Opcional      Numérico"],
    ["lat                      Opcional      Numérico decimal (negativo para sur)"],
    ["lng                      Opcional      Numérico decimal (negativo para oeste)"],
    [""],
    ["Si el código ya existe, se actualizan los campos con valor.  Si no existe, se crea la central."],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Centrales");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instrucciones), "Instrucciones");
  XLSX.writeFile(wb, "plantilla_centrales.xlsx");
}

// -------- Paleta de colores persistente --------
export interface Palette {
  preset: string;
  hidro: string;
  eolico: string;
  solar: string;
  termico: string;
  otro: string;
  accent: string;
}

export const DEFAULT_PALETTE: Palette = {
  preset: "osinergmin_vivo",
  hidro: "#0090D4",
  eolico: "#00B140",
  solar: "#FFC20E",
  termico: "#E4002B",
  otro: "#6C2C91",
  accent: "#00B7C7",
};

export async function getPalette(): Promise<Palette> {
  const { data } = await supabase.from("user_settings").select("palette").eq("id", "global").maybeSingle();
  const p = (data?.palette ?? {}) as Partial<Palette>;
  return { ...DEFAULT_PALETTE, ...p };
}

export async function savePalette(palette: Palette): Promise<void> {
  const { error } = await supabase
    .from("user_settings")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert({ id: "global", palette: palette as any });
  if (error) throw error;
}

// -------- Helpers de agregación (granularidad) --------
export function bucketKey(iso: string, g: Granularity): string {
  if (g === "day") return iso;
  if (g === "month") return iso.slice(0, 7);
  // week: ISO week (lunes)
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

export function dayOfPeriod(iso: string, g: Granularity): number {
  const d = new Date(iso + "T00:00:00Z");
  if (g === "day") {
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    return Math.floor((d.getTime() - start) / 86400000);
  }
  if (g === "month") return d.getUTCMonth() + 1;
  // week of year
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diff = (d.getTime() - first.getTime()) / 86400000;
  return Math.ceil((diff + first.getUTCDay() + 1) / 7);
}

export function periodLabel(k: number, g: Granularity): string {
  if (g === "month") {
    return ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][k - 1] ?? String(k);
  }
  if (g === "week") return `Sem ${k}`;
  const date = new Date(Date.UTC(2024, 0, k));
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function periodCount(g: Granularity): number {
  return g === "day" ? 366 : g === "week" ? 53 : 12;
}
