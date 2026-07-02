import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  bucketKey,
  getMeasurementsByTech,
  listPlants,
  TECH_LABEL,
  type Granularity,
  type Technology,
} from "@/lib/centrales";
import { useEffect, useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { useTheme } from "@/lib/theme";
import { ChartControls } from "@/components/ChartControls";

const TECHS: Technology[] = ["hidro", "eolico", "solar", "termico"];
const OUT: ("AISLADO" | "OTRO")[] = ["AISLADO", "OTRO"];

export const Route = createFileRoute("/fuera-sein")({
  head: () => ({ meta: [{ title: "Fuera del SEIN — SEIN BI" }] }),
  component: FueraSein,
});

function FueraSein() {
  const { palette } = useTheme();
  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Fuera del SEIN</h1>
        <p className="text-sm text-slate-400">
          Análisis rápido de centrales aisladas u otras que no forman parte del SEIN/COES,
          agrupadas por tecnología.
        </p>
      </header>
      <div className="grid gap-4">
        {TECHS.map((t) => <TechCard key={t} tech={t} color={palette[t]} />)}
      </div>
    </div>
  );
}

function TechCard({ tech, color }: { tech: Technology; color: string }) {
  const { data: plants = [] } = useQuery({
    queryKey: ["plants", tech, "fuera"],
    queryFn: () => listPlants({ tech, system: OUT }),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["measurements", tech, "fuera"],
    queryFn: () => getMeasurementsByTech(tech, { system: OUT }),
  });

  const [granularity, setGranularity] = useState<Granularity>("day");
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows) s.add(Number(r.date.slice(0, 4)));
    return [...s].sort();
  }, [rows]);
  useEffect(() => {
    if (availableYears.length && selectedYears.size === 0) setSelectedYears(new Set(availableYears));
  }, [availableYears, selectedYears.size]);
  const effectiveYears = selectedYears.size ? selectedYears : new Set(availableYears);

  const filteredRows = rows.filter((r) => effectiveYears.has(Number(r.date.slice(0, 4))));

  const agg = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of filteredRows) {
      const k = bucketKey(r.date, granularity);
      m.set(k, (m.get(k) ?? 0) + Number(r.mw));
    }
    const dates = [...m.keys()].sort();
    return { dates, values: dates.map((d) => m.get(d)!) };
  }, [filteredRows, granularity]);

  const kpis = useMemo(() => {
    const potencia = plants.reduce((a, p) => a + (Number(p.installed_mw) || 0), 0);
    return {
      count: plants.length,
      potencia,
      media: agg.values.length ? agg.values.reduce((a, b) => a + b, 0) / agg.values.length : 0,
    };
  }, [plants, agg]);

  const top = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of filteredRows) totals.set(r.plant_id, (totals.get(r.plant_id) ?? 0) + Number(r.mw));
    return plants
      .map((p) => ({ ...p, total: totals.get(p.id) ?? 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [plants, filteredRows]);

  const toggleYear = (y: number) => {
    const next = new Set(effectiveYears);
    if (next.has(y)) next.delete(y); else next.add(y);
    setSelectedYears(next);
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold" style={{ color }}>{TECH_LABEL[tech]}s fuera del SEIN</h2>
        <div className="text-xs text-slate-400">
          {kpis.count} centrales · {kpis.potencia.toFixed(0)} MW inst · media {kpis.media.toFixed(1)} MW
        </div>
      </header>
      {kpis.count === 0 ? (
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-4 text-center text-sm text-slate-500">
          Sin centrales de esta tecnología fuera del SEIN.
        </div>
      ) : (
        <>
          <div className="mb-3">
            <ChartControls
              years={availableYears}
              selectedYears={effectiveYears}
              onToggleYear={toggleYear}
              granularity={granularity}
              onGranularityChange={setGranularity}
              accent={color}
            />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="h-[220px]">
              <Line
                data={{ labels: agg.dates, datasets: [{ label: "MW", data: agg.values, borderColor: color, backgroundColor: `${color}33`, fill: true, pointRadius: 0, tension: 0.25 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#94a3b8", maxTicksLimit: 8 }, grid: { color: "#1e293b" } }, y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } } } }}
              />
            </div>
            <div className="h-[220px]">
              <Bar
                data={{ labels: top.map((t) => t.name), datasets: [{ label: "MW·d", data: top.map((t) => t.total), backgroundColor: color }] }}
                options={{ indexAxis: "y" as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } }, y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#1e293b" } } } }}
              />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
