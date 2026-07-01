// Capa de acceso a datos (cliente Supabase / Lovable Cloud).
// Panel interno sin auth — políticas permisivas intencionales.

import { supabase } from "@/integrations/supabase/client";

export type Technology = "hidro" | "eolico" | "solar" | "termico" | "otro";
export type System = "SEIN" | "COES" | "AISLADO" | "OTRO";

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

export const TECH_LABEL: Record<Technology, string> = {
  hidro: "Hidroeléctrica",
  eolico: "Eólica",
  solar: "Solar",
  termico: "Térmica",
  otro: "Otro",
};

export const DEFAULT_TECH_COLOR: Record<Technology, string> = {
  hidro: "#0ea5e9",
  eolico: "#10b981",
  solar: "#f59e0b",
  termico: "#ef4444",
  otro: "#94a3b8",
};

// Compatibilidad hacia atrás — el theme provider expone los colores dinámicos.
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

export async function getMeasurementsByTech(
  tech: Technology,
  opts?: { system?: System[]; from?: string; to?: string },
): Promise<Measurement[]> {
  const plants = await listPlants({ tech, system: opts?.system });
  if (!plants.length) return [];
  const ids = plants.map((p) => p.id);
  // Fetch en chunks para evitar URL demasiado larga con muchos ids
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
    .order("uploaded_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function listUploads(limit = 20) {
  const { data, error } = await supabase
    .from("data_uploads")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// -------- Upload mediciones (matching por CÓDIGO) --------
export async function uploadMeasurements(args: {
  technology: Technology;
  system?: System;
  filename: string;
  rows: Array<{ plantCode: string; plantName: string; date: string; mw: number }>;
}) {
  const { technology, system = "SEIN", filename, rows } = args;
  if (!rows.length) return { inserted: 0, plantsTouched: 0 };

  const uniq = new Map<string, string>(); // code -> name
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

  const measurements = rows
    .map((r) => ({
      plant_id: codeToId.get(r.plantCode.trim()),
      date: r.date,
      mw: r.mw,
    }))
    .filter((m) => m.plant_id && m.date && Number.isFinite(m.mw)) as Array<{
    plant_id: string;
    date: string;
    mw: number;
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

  await supabase.from("data_uploads").insert({
    technology,
    filename,
    rows_inserted: inserted,
    plants_touched: codeToId.size,
  });

  return { inserted, plantsTouched: codeToId.size };
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
  preset: "osinergmin",
  hidro: "#0ea5e9",
  eolico: "#10b981",
  solar: "#f59e0b",
  termico: "#ef4444",
  otro: "#94a3b8",
  accent: "#38bdf8",
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
