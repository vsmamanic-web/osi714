// Mapa Leaflet compacto con selección bidireccional.
// - Muestra únicamente los `plants` recibidos.
// - Resalta los `selectedIds` con un anillo y popup abierto.
// - Al hacer clic sobre un marcador ejecuta `onToggle(id)`.
import { useEffect, useRef } from "react";
import type { Plant } from "@/lib/centrales";
import { TECH_LABEL } from "@/lib/centrales";
import { useTheme } from "@/lib/theme";

const REGION_COORDS: Record<string, [number, number]> = {
  NORTE: [-5.2, -79.0],
  CENTRO: [-12.05, -75.0],
  SUR: [-16.4, -71.5],
};

interface Props {
  plants: Plant[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  height?: number;
}

export function PlantsMiniMap({ plants, selectedIds, onToggle, height = 320 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  const { palette } = useTheme();
  const selSet = new Set(selectedIds);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;
      if (!mapRef.current) {
        const map = L.map(ref.current, {
          center: [-10, -76], zoom: 5, scrollWheelZoom: true, attributionControl: false,
        });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
        mapRef.current = map;
      }
      const map = mapRef.current;
      if (layerRef.current) map.removeLayer(layerRef.current);
      const group = L.layerGroup().addTo(map);
      layerRef.current = group;

      const regionCount: Record<string, number> = {};
      for (const p of plants) if (p.lat == null || p.lng == null) {
        const k = p.region ?? "CENTRO";
        regionCount[k] = (regionCount[k] ?? 0) + 1;
      }
      const regionIdx: Record<string, number> = {};

      const bounds: Array<[number, number]> = [];
      for (const p of plants) {
        const real = p.lat != null && p.lng != null;
        let lat = p.lat, lng = p.lng;
        if (!real) {
          const key = p.region ?? "CENTRO";
          const base = REGION_COORDS[key] ?? REGION_COORDS.CENTRO;
          const n = regionCount[key] || 1;
          const i = (regionIdx[key] = (regionIdx[key] ?? 0) + 1);
          const angle = (2 * Math.PI * i) / n;
          const radius = 0.4 + (i % 5) * 0.08;
          lat = base[0] + Math.cos(angle) * radius;
          lng = base[1] + Math.sin(angle) * radius;
        }
        const isSel = selSet.has(p.id);
        const color = (palette as unknown as Record<string, string>)[p.technology] ?? palette.otro;
        const marker = L.circleMarker([lat!, lng!], {
          radius: isSel ? 10 : 6,
          color: isSel ? "#0B1220" : color,
          weight: isSel ? 3 : 1.5,
          fillColor: color,
          fillOpacity: isSel ? 0.95 : 0.75,
        }).addTo(group);
        const popup = `
          <div style="font-family:system-ui;font-size:12px;min-width:200px">
            <div style="font-weight:700">${p.name}</div>
            <div style="color:#64748b;font-size:11px">${TECH_LABEL[p.technology] ?? p.technology}</div>
            <div style="margin-top:4px"><b>Código:</b> ${p.code}</div>
            <div><b>Región:</b> ${p.region ?? "—"}</div>
            <div><b>Empresa:</b> ${p.company ?? "—"}</div>
            ${p.installed_mw != null ? `<div><b>Potencia:</b> ${p.installed_mw} MW</div>` : ""}
            <div style="margin-top:4px;font-size:10px;color:${real ? "#10b981" : "#f59e0b"}">
              ${real ? "● coordenada real" : "○ coordenada aproximada"}
            </div>
            <div style="margin-top:6px;font-size:10px;color:#334155">
              ${isSel ? "✓ Seleccionada — clic para quitar" : "Clic para seleccionar"}
            </div>
          </div>`;
        marker.bindPopup(popup);
        marker.on("click", () => onToggle(p.id));
        if (isSel) marker.openPopup();
        bounds.push([lat!, lng!]);
      }
      if (bounds.length) {
        try { map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8 }); } catch { /* noop */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plants, selectedIds.join(","), palette]);

  useEffect(() => () => {
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
  }, []);

  return <div ref={ref} style={{ height }} className="overflow-hidden rounded-lg border border-slate-800" />;
}
