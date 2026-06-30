import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getMeasurementsByTech,
  listPlants,
  TECH_COLOR,
  TECH_LABEL,
  type Technology,
} from "@/lib/centrales";
import { useMemo, useState } from "react";
import {
  Line,
} from "react-chartjs-2";
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  TimeScale,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend, TimeScale);

const VALID: Technology[] = ["hidro", "eolico", "solar", "termico"];

export const Route = createFileRoute("/tecnologia/$tech")({
  parseParams: ({ tech }) => {
    if (!VALID.includes(tech as Technology)) throw notFound();
    return { tech: tech as Technology };
  },
  head: ({ params }) => ({
    meta: [{ title: `${TECH_LABEL[params.tech as Technology]} — SEIN BI` }],
  }),
  component: TechModule,
});

function TechModule() {
  const { tech } = Route.useParams();
  const { data: plants = [] } = useQuery({
    queryKey: ["plants", tech],
    queryFn: () => listPlants(tech),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["measurements", tech],
    queryFn: () => getMeasurementsByTech(tech),
  });

  const [region, setRegion] = useState<string>("ALL");
  const filteredPlants = plants.filter((p) => region === "ALL" || p.region === region);
  const plantIds = new Set(filteredPlants.map((p) => p.id));
  const filteredRows = rows.filter((r) => plantIds.has(r.plant_id));

  // KPIs
  const kpis = useMemo(() => {
    if (!filteredRows.length) {
      return { totalMW: 0, mediaDiaria: 0, max: 0, min: 0, dias: 0 };
    }
    const byDate = new Map<string, number>();
    for (const r of filteredRows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.mw));
    const totals = [...byDate.values()];
    return {
      totalMW: totals.reduce((a, b) => a + b, 0),
      mediaDiaria: totals.reduce((a, b) => a + b, 0) / totals.length,
      max: Math.max(...totals),
      min: Math.min(...totals),
      dias: byDate.size,
    };
  }, [filteredRows]);

  // Serie temporal agregada
  const chartData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const r of filteredRows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.mw));
    const labels = [...byDate.keys()].sort();
    const data = labels.map((d) => byDate.get(d)!);
    return {
      labels,
      datasets: [
        {
          label: `MW totales — ${TECH_LABEL[tech]}`,
          data,
          borderColor: TECH_COLOR[tech],
          backgroundColor: `${TECH_COLOR[tech]}33`,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    };
  }, [filteredRows, tech]);

  // Top centrales
  const topPlants = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of filteredRows) totals.set(r.plant_id, (totals.get(r.plant_id) ?? 0) + Number(r.mw));
    return filteredPlants
      .map((p) => ({ ...p, total: totals.get(p.id) ?? 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);
  }, [filteredRows, filteredPlants]);

  const regions = ["ALL", ...Array.from(new Set(plants.map((p) => p.region).filter(Boolean)))];

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TECH_COLOR[tech] }}>
            {TECH_LABEL[tech]}s
          </h1>
          <p className="text-sm text-slate-400">
            {filteredPlants.length} centrales · {filteredRows.length.toLocaleString()} registros
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs uppercase tracking-widest text-slate-400">Región</label>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm"
          >
            {regions.map((r) => (
              <option key={r ?? "n"} value={r ?? ""}>
                {r === "ALL" ? "Todas" : r}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Energía total" value={`${kpis.totalMW.toLocaleString("es-PE", { maximumFractionDigits: 0 })} MW·d`} />
        <Kpi label="Media diaria" value={`${kpis.mediaDiaria.toFixed(1)} MW`} />
        <Kpi label="Máximo diario" value={`${kpis.max.toFixed(1)} MW`} accent="text-emerald-400" />
        <Kpi label="Mínimo diario" value={`${kpis.min.toFixed(1)} MW`} accent="text-rose-400" />
        <Kpi label="Días con datos" value={kpis.dias.toString()} />
      </section>

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Generación diaria agregada
        </h2>
        <div className="mt-3 h-[340px]">
          {filteredRows.length ? (
            <Line
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: "#cbd5e1" } } },
                scales: {
                  x: { ticks: { color: "#94a3b8", maxTicksLimit: 12 }, grid: { color: "#1e293b" } },
                  y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
                },
              }}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          Top 15 centrales por energía acumulada
        </h2>
        <div className="mt-3 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="px-2 py-2 text-left">Central</th>
                <th className="px-2 py-2 text-left">Empresa</th>
                <th className="px-2 py-2 text-left">Región</th>
                <th className="px-2 py-2 text-right">MW·d</th>
              </tr>
            </thead>
            <tbody>
              {topPlants.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                    Sin datos. Sube un Excel para esta tecnología.
                  </td>
                </tr>
              )}
              {topPlants.map((p) => (
                <tr key={p.id} className="border-t border-slate-800">
                  <td className="px-2 py-2 font-medium">{p.name}</td>
                  <td className="px-2 py-2 text-slate-400">{p.company ?? "—"}</td>
                  <td className="px-2 py-2 text-slate-400">{p.region ?? "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {p.total.toLocaleString("es-PE", { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="grid h-full place-items-center text-slate-500">
      <div className="text-center">
        <div className="text-4xl">📊</div>
        <div className="mt-2 text-sm">No hay mediciones cargadas todavía.</div>
        <div className="text-xs">Ve a “Cargar Excel” para subir datos.</div>
      </div>
    </div>
  );
}
