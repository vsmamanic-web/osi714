import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listPlants, TECH_COLOR, TECH_LABEL, type Technology } from "@/lib/centrales";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/mapa")({
  head: () => ({ meta: [{ title: "Mapa interactivo — SEIN BI" }] }),
  ssr: false,
  component: MapPage,
});

// Coordenadas aproximadas por región (fallback cuando la central no tiene lat/lng).
const REGION_COORDS: Record<string, [number, number]> = {
  NORTE: [-5.2, -79.0],
  CENTRO: [-12.05, -75.0],
  SUR: [-16.4, -71.5],
};

function MapPage() {
  const { data: plants = [] } = useQuery({ queryKey: ["plants"], queryFn: () => listPlants() });
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const map = L.map(ref.current, {
        center: [-10, -76],
        zoom: 6,
        scrollWheelZoom: true,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap, © CARTO",
        maxZoom: 18,
      }).addTo(map);
      mapRef.current = map;

      // Agrupar por región para jitter cuando no hay coords
      const regionCount: Record<string, number> = {};
      for (const p of plants) {
        const key = p.region ?? "CENTRO";
        regionCount[key] = (regionCount[key] ?? 0) + 1;
      }
      const regionIdx: Record<string, number> = {};

      for (const p of plants) {
        let lat = p.lat;
        let lng = p.lng;
        if (lat == null || lng == null) {
          const key = p.region ?? "CENTRO";
          const base = REGION_COORDS[key] ?? REGION_COORDS.CENTRO;
          const n = regionCount[key] || 1;
          const i = (regionIdx[key] = (regionIdx[key] ?? 0) + 1);
          const angle = (2 * Math.PI * i) / n;
          const radius = 0.6 + (i % 7) * 0.08;
          lat = base[0] + Math.cos(angle) * radius;
          lng = base[1] + Math.sin(angle) * radius;
        }
        const color = TECH_COLOR[p.technology as Technology] ?? "#94a3b8";
        const marker = L.circleMarker([lat!, lng!], {
          radius: 6,
          color,
          weight: 1.5,
          fillColor: color,
          fillOpacity: 0.7,
        }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:system-ui;font-size:12px;min-width:180px">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">${p.name}</div>
            <div style="color:#64748b">${TECH_LABEL[p.technology as Technology] ?? p.technology}</div>
            <div style="margin-top:6px"><b>Empresa:</b> ${p.company ?? "—"}</div>
            <div><b>Región:</b> ${p.region ?? "—"}</div>
            <div><b>Código:</b> ${p.code}</div>
            ${p.installed_mw != null ? `<div><b>Potencia:</b> ${p.installed_mw} MW</div>` : ""}
          </div>
        `);
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [plants]);

  return (
    <div className="flex h-screen flex-col p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Mapa interactivo de centrales</h1>
          <p className="text-xs text-slate-400">
            {plants.length} centrales · coordenadas aproximadas por región mientras se cargan latitud/longitud reales.
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          {(["hidro", "eolico", "solar", "termico"] as Technology[]).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: TECH_COLOR[t] }} />
              {TECH_LABEL[t]}
            </span>
          ))}
        </div>
      </header>
      <div ref={ref} className="flex-1 overflow-hidden rounded-xl border border-slate-800" />
    </div>
  );
}
