import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { IN_SEIN, listPlants, SYSTEM_LABEL, TECH_LABEL, type System, type Technology } from "@/lib/centrales";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/mapa")({
  head: () => ({ meta: [{ title: "Mapa interactivo — SEIN BI" }] }),
  ssr: false,
  component: MapPage,
});

const REGION_COORDS: Record<string, [number, number]> = {
  NORTE: [-5.2, -79.0],
  CENTRO: [-12.05, -75.0],
  SUR: [-16.4, -71.5],
};
const SYSTEMS: System[] = ["SEIN", "COES", "AISLADO", "OTRO"];
const TECHS: Technology[] = ["hidro", "eolico", "solar", "termico"];

function MapPage() {
  const { palette } = useTheme();
  const { data: plants = [] } = useQuery({ queryKey: ["plants"], queryFn: () => listPlants() });
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  const [techSel, setTechSel] = useState<Set<Technology>>(new Set(TECHS));
  const [sysSel, setSysSel] = useState<Set<System>>(new Set(SYSTEMS));
  const [showApprox, setShowApprox] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      const map = L.map(ref.current, { center: [-10, -76], zoom: 6, scrollWheelZoom: true });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap, © CARTO",
        maxZoom: 18,
      }).addTo(map);
      mapRef.current = map;

      const filtered = plants.filter((p) =>
        techSel.has(p.technology as Technology) && sysSel.has(p.system as System),
      );

      const regionCount: Record<string, number> = {};
      for (const p of filtered) {
        if (p.lat != null && p.lng != null) continue;
        const key = p.region ?? "CENTRO";
        regionCount[key] = (regionCount[key] ?? 0) + 1;
      }
      const regionIdx: Record<string, number> = {};

      for (const p of filtered) {
        const real = p.lat != null && p.lng != null;
        if (!real && !showApprox) continue;
        let lat = p.lat, lng = p.lng;
        if (!real) {
          const key = p.region ?? "CENTRO";
          const base = REGION_COORDS[key] ?? REGION_COORDS.CENTRO;
          const n = regionCount[key] || 1;
          const i = (regionIdx[key] = (regionIdx[key] ?? 0) + 1);
          const angle = (2 * Math.PI * i) / n;
          const radius = 0.6 + (i % 7) * 0.08;
          lat = base[0] + Math.cos(angle) * radius;
          lng = base[1] + Math.sin(angle) * radius;
        }
        const color = palette[p.technology as Technology] ?? palette.otro;
        const marker = L.circleMarker([lat!, lng!], {
          radius: real ? 7 : 5,
          color,
          weight: real ? 2 : 1,
          fillColor: color,
          fillOpacity: real ? 0.85 : 0.4,
          dashArray: real ? undefined : "3,3",
        }).addTo(map);
        const inSein = IN_SEIN.includes(p.system as System);
        marker.bindPopup(`
          <div style="font-family:system-ui;font-size:12px;min-width:200px">
            <div style="font-weight:700;font-size:13px">${p.name}</div>
            <div style="color:#64748b;font-size:11px">${TECH_LABEL[p.technology as Technology] ?? p.technology} · ${SYSTEM_LABEL[p.system as System] ?? p.system}</div>
            <div style="margin-top:6px"><b>Código:</b> ${p.code}</div>
            <div><b>Empresa:</b> ${p.company ?? "—"}</div>
            <div><b>Región:</b> ${p.region ?? "—"}</div>
            ${p.installed_mw != null ? `<div><b>Potencia:</b> ${p.installed_mw} MW</div>` : ""}
            <div style="margin-top:4px;color:${real ? "#10b981" : "#f59e0b"};font-size:10px">
              ${real ? "● coord real" : "○ coord aproximada"}
            </div>
            <div style="margin-top:4px;font-size:10px;color:#64748b">${inSein ? "Dentro del SEIN" : "Fuera del SEIN"}</div>
          </div>
        `);
      }
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [plants, techSel, sysSel, showApprox, palette]);

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    apply(next);
  };

  return (
    <div className="flex h-screen flex-col p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Mapa interactivo de centrales</h1>
          <p className="text-xs text-slate-400">{plants.length} centrales cargadas</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Tec:</span>
            {TECHS.map((t) => (
              <button key={t} onClick={() => toggle(techSel, t, setTechSel)}
                className="rounded-md px-2 py-1"
                style={{ backgroundColor: techSel.has(t) ? `${palette[t]}30` : "#0f172a", color: techSel.has(t) ? palette[t] : "#64748b", border: `1px solid ${palette[t]}55` }}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Sist:</span>
            {SYSTEMS.map((s) => (
              <button key={s} onClick={() => toggle(sysSel, s, setSysSel)}
                className={`rounded-md border px-2 py-1 ${sysSel.has(s) ? "border-sky-500 bg-sky-500/10 text-sky-300" : "border-slate-700 text-slate-500"}`}>
                {SYSTEM_LABEL[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-slate-400">
            <input type="checkbox" checked={showApprox} onChange={(e) => setShowApprox(e.target.checked)} />
            Mostrar aproximadas
          </label>
        </div>
      </header>
      <div ref={ref} className="flex-1 overflow-hidden rounded-xl border border-slate-800" />
      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
        <span>● borde sólido = coord real</span>
        <span>○ borde punteado = coord aproximada (por región)</span>
        <span>Sube coordenadas reales en <b>Cargar Excel → Coordenadas / metadatos</b>.</span>
      </div>
    </div>
  );
}
