// Capa de acceso a datos (cliente Supabase / Lovable Cloud).
// Lectura/escritura directa con la clave publishable (sin auth) — panel interno.

import { supabase } from "@/integrations/supabase/client";

export type Technology = "hidro" | "eolico" | "solar" | "termico" | "otro";

export interface Plant {
  id: string;
  code: string;
  name: string;
  technology: Technology;
  company: string | null;
  region: string | null;
  installed_mw: number | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
}

export interface Measurement {
  plant_id: string;
  date: string; // yyyy-mm-dd
  mw: number;
}

export const TECH_LABEL: Record<Technology, string> = {
  hidro: "Hidroeléctrica",
  eolico: "Eólica",
  solar: "Solar",
  termico: "Térmica",
  otro: "Otro",
};

export const TECH_COLOR: Record<Technology, string> = {
  hidro: "#0ea5e9",
  eolico: "#10b981",
  solar: "#f59e0b",
  termico: "#ef4444",
  otro: "#94a3b8",
};

export async function listPlants(tech?: Technology): Promise<Plant[]> {
  let q = supabase.from("plants").select("*").order("name");
  if (tech) q = q.eq("technology", tech);
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
  from?: string,
  to?: string,
): Promise<Measurement[]> {
  const plants = await listPlants(tech);
  if (!plants.length) return [];
  const ids = plants.map((p) => p.id);
  let q = supabase
    .from("measurements")
    .select("plant_id,date,mw")
    .in("plant_id", ids)
    .order("date");
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Measurement[];
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

// Inserta nuevas mediciones. Crea centrales nuevas si el código/nombre no existe.
export async function uploadMeasurements(args: {
  technology: Technology;
  filename: string;
  rows: Array<{ plantName: string; date: string; mw: number }>;
}) {
  const { technology, filename, rows } = args;
  if (!rows.length) return { inserted: 0, plantsTouched: 0 };

  // Resolver/crear centrales por nombre normalizado.
  const uniqueNames = Array.from(new Set(rows.map((r) => r.plantName.trim()))).filter(Boolean);
  const { data: existing, error: e1 } = await supabase
    .from("plants")
    .select("id,name,code")
    .in("name", uniqueNames);
  if (e1) throw e1;
  const nameToId = new Map<string, string>();
  for (const p of existing ?? []) nameToId.set(p.name, p.id);

  const missing = uniqueNames.filter((n) => !nameToId.has(n));
  if (missing.length) {
    const toInsert = missing.map((n) => ({
      code: `${technology.toUpperCase()}_${n}`.slice(0, 60),
      name: n,
      technology,
    }));
    const { data: inserted, error: e2 } = await supabase
      .from("plants")
      .insert(toInsert)
      .select("id,name");
    if (e2) throw e2;
    for (const p of inserted ?? []) nameToId.set(p.name, p.id);
  }

  // Construir mediciones.
  const measurements = rows
    .map((r) => ({
      plant_id: nameToId.get(r.plantName.trim()),
      date: r.date,
      mw: r.mw,
    }))
    .filter((m) => m.plant_id && m.date && Number.isFinite(m.mw)) as Array<{
    plant_id: string;
    date: string;
    mw: number;
  }>;

  // Insert por chunks con upsert.
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
    plants_touched: nameToId.size,
  });

  return { inserted, plantsTouched: nameToId.size };
}
