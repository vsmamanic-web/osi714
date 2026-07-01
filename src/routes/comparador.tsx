import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMeasurementsByPlant, listPlants } from "@/lib/centrales";
import { Line } from "react-chartjs-2";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

export const Route = createFileRoute("/comparador")({
  head: () => ({ meta: [{ title: "Comparador multi-año — SEIN BI" }] }),
  component: Comparator,
});

const YEAR_COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];

function dayOfYearLabel(d: number): string {
  // Convertir día 1..366 a "01-Ene" usando 2024 (bisiesto) como referencia.
  const date = new Date(Date.UTC(2024, 0, d));
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function dayOfYear(iso: string): number {
  const d = new Date(iso + "T00:00:00Z");
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0));
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function Comparator() {
  const { data: plants = [] } = useQuery({ queryKey: ["plants"], queryFn: () => listPlants() });
  const [plantId, setPlantId] = useState<string>("");
  const { data: meas = [] } = useQuery({
    queryKey: ["meas", plantId],
    queryFn: () => getMeasurementsByPlant(plantId),
    enabled: !!plantId,
  });

  // Años disponibles
  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const m of meas) ys.add(Number(m.date.slice(0, 4)));
    return [...ys].sort();
  }, [meas]);

  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  // Sincronizar selección por defecto
  const effectiveYears = selectedYears.size ? selectedYears : new Set(years);

  // Series por año (eje X = día del año 1..366)
  const chart = useMemo(() => {
    const byYear = new Map<number, Map<number, number>>();
    for (const m of meas) {
      const y = Number(m.date.slice(0, 4));
      if (!effectiveYears.has(y)) continue;
      const doy = dayOfYear(m.date);
      let inner = byYear.get(y);
      if (!inner) byYear.set(y, (inner = new Map()));
      inner.set(doy, (inner.get(doy) ?? 0) + Number(m.mw));
    }
    const labels = Array.from({ length: 366 }, (_, i) => dayOfYearLabel(i + 1));
    const datasets = [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, vals], idx) => ({
        label: String(year),
        data: labels.map((_, i) => vals.get(i + 1) ?? null),
        borderColor: YEAR_COLORS[idx % YEAR_COLORS.length],
        backgroundColor: `${YEAR_COLORS[idx % YEAR_COLORS.length]}22`,
        spanGaps: true,
        tension: 0.2,
        pointRadius: 0,
        borderWidth: 2,
      }));
    return { labels, datasets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meas, [...effectiveYears].join(",")]);

  // Diferencias entre años seleccionados (totales y vs primer año)
  const yearSummary = useMemo(() => {
    const totals = new Map<number, number>();
    for (const m of meas) {
      const y = Number(m.date.slice(0, 4));
      if (!effectiveYears.has(y)) continue;
      totals.set(y, (totals.get(y) ?? 0) + Number(m.mw));
    }
    const sorted = [...totals.entries()].sort((a, b) => a[0] - b[0]);
    const base = sorted[0]?.[1] ?? 0;
    return sorted.map(([y, t]) => ({
      year: y,
      total: t,
      diffAbs: t - base,
      diffPct: base ? ((t - base) / base) * 100 : 0,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meas, [...effectiveYears].join(",")]);

  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Comparador multi-año</h1>
        <p className="text-sm text-slate-400">
          Superpone la evolución diaria (MW) de varios años para una misma central. Eje X = día del año (1-Ene a 31-Dic).
        </p>
      </header>

      <section className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 md:grid-cols-[1fr_auto]">
        <div>
          <label className="text-xs uppercase tracking-widest text-slate-400">Central</label>
          <select
            value={plantId}
            onChange={(e) => {
              setPlantId(e.target.value);
              setSelectedYears(new Set());
            }}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          >
            <option value="">— Selecciona una central —</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.code}] {p.name} · {p.technology} · {p.system}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400">Años</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {years.length === 0 && (
              <span className="text-xs text-slate-500">Sin datos para esta central</span>
            )}
            {years.map((y, i) => {
              const active = effectiveYears.has(y);
              return (
                <button
                  key={y}
                  onClick={() => {
                    const next = new Set(effectiveYears);
                    if (next.has(y)) next.delete(y);
                    else next.add(y);
                    setSelectedYears(next);
                  }}
                  className="rounded-md border px-3 py-1 text-xs font-semibold"
                  style={{
                    borderColor: YEAR_COLORS[i % YEAR_COLORS.length],
                    color: active ? "white" : YEAR_COLORS[i % YEAR_COLORS.length],
                    background: active ? YEAR_COLORS[i % YEAR_COLORS.length] : "transparent",
                  }}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="h-[420px]">
          {meas.length ? (
            <Line
              data={chart}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                  legend: { labels: { color: "#cbd5e1" } },
                  tooltip: {
                    callbacks: {
                      title: (items) => items[0]?.label ?? "",
                      label: (ctx) =>
                        `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2) ?? "—"} MW`,
                    },
                  },
                },
                scales: {
                  x: { ticks: { color: "#94a3b8", maxTicksLimit: 12 }, grid: { color: "#1e293b" } },
                  y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" }, title: { display: true, text: "MW", color: "#94a3b8" } },
                },
              }}
            />
          ) : (
            <div className="grid h-full place-items-center text-slate-500">
              {plantId ? "No hay mediciones para esta central." : "Selecciona una central para ver la comparación."}
            </div>
          )}
        </div>
      </section>

      {yearSummary.length > 1 && (
        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Comparación entre años (vs {yearSummary[0].year})
          </h2>
          <div className="mt-3 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-2 py-2 text-left">Año</th>
                  <th className="px-2 py-2 text-right">Energía total (MW·d)</th>
                  <th className="px-2 py-2 text-right">Δ Absoluta</th>
                  <th className="px-2 py-2 text-right">Δ %</th>
                </tr>
              </thead>
              <tbody>
                {yearSummary.map((s) => (
                  <tr key={s.year} className="border-t border-slate-800">
                    <td className="px-2 py-2 font-medium">{s.year}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.total.toFixed(0)}</td>
                    <td
                      className={`px-2 py-2 text-right tabular-nums ${s.diffAbs > 0 ? "text-emerald-400" : s.diffAbs < 0 ? "text-rose-400" : ""}`}
                    >
                      {s.diffAbs > 0 ? "+" : ""}
                      {s.diffAbs.toFixed(0)}
                    </td>
                    <td
                      className={`px-2 py-2 text-right tabular-nums ${s.diffPct > 0 ? "text-emerald-400" : s.diffPct < 0 ? "text-rose-400" : ""}`}
                    >
                      {s.diffPct > 0 ? "+" : ""}
                      {s.diffPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
