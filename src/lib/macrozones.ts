// Mapeo de regiones peruanas a macrozonas (Norte / Centro / Sur).
export type Macrozone = "Norte" | "Centro" | "Sur" | "Otro";

const NORTE = new Set([
  "tumbes","piura","lambayeque","la libertad","cajamarca","amazonas","san martin","san martín","loreto",
]);
const CENTRO = new Set([
  "ancash","áncash","lima","callao","ica","huanuco","huánuco","pasco","junin","junín","huancavelica","ucayali",
]);
const SUR = new Set([
  "ayacucho","apurimac","apurímac","cusco","cuzco","arequipa","moquegua","tacna","puno","madre de dios",
]);

export function macrozoneOf(region: string | null | undefined): Macrozone {
  if (!region) return "Otro";
  const r = region.trim().toLowerCase();
  if (NORTE.has(r)) return "Norte";
  if (CENTRO.has(r)) return "Centro";
  if (SUR.has(r)) return "Sur";
  return "Otro";
}

export const MACROZONES: Macrozone[] = ["Norte", "Centro", "Sur"];
export const MACROZONE_COLOR: Record<Macrozone, string> = {
  Norte: "#F39F30",
  Centro: "#00559E",
  Sur: "#00B6F1",
  Otro: "#9CA3AF",
};
