import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  bucketKey,
  getMeasurementsByTech,
  IN_SEIN,
  listPlants,
  TECH_LABEL,
  type Granularity,
  type Measurement,
  type Technology,
} from "@/lib/centrales";
import { useEffect, useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  BarElement,
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
import { useTechColor } from "@/lib/theme";
import { ChartControls } from "@/components/ChartControls";
import { exportNodeAsPNG, exportReportPDF, exportRowsAsExcel } from "@/lib/exportReport";
import { useRef } from "react";

ChartJS.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend, TimeScale);

const VALID: Technology[] = ["hidro", "eolico", "solar", "termico"];

export const Route = createFileRoute("/tecnologia/$tech")({
  head: ({ params }) => {
    const t = params.tech as Technology;
    const label = VALID.includes(t) ? TECH_LABEL[t] : "Tecnología";
    return { meta: [{ title: `${label} — SEIN BI` }] };
  },
  component: TechModule,
});

function aggregate(rows: Measurement[], g: Granularity): { keys: string[]; values: number[] } {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = bucketKey(r.date, g);
    m.set(k, (m.get(k) ?? 0) + Number(r.mw));
  }
  const keys = [...m.keys()].sort();
  return { keys, values: keys.map((k) => m.get(k)!) };
}

function TechModule() {
  const { tech } = Route.useParams() as { tech: Technology };
  const color = useTechColor(tech);

  const { data: plants = [] } = useQuery({
    queryKey: ["plants", tech, "sein"],
    queryFn: () => listPlants({ tech, system: IN_SEIN }),
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["measurements", tech, "sein"],
    queryFn: () => getMeasurementsByTech(tech, { system: IN_SEIN }),
  });

  const [region, setRegion] = useState<string>("ALL");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());

  // Años disponibles
  const availableYears = useMemo(() => {
    const s = new Set<number>();
    for (const r of rows) s.add(Number(r.date.slice(0, 4)));
    return [...s].sort();
  }, [rows]);

  // Auto-seleccionar todos los años cuando aparecen datos nuevos
  useEffect(() => {
    if (availableYears.length && selectedYears.size === 0) {
      setSelectedYears(new Set(availableYears));
    }
  }, [availableYears, selectedYears.size]);

  const effectiveYears = selectedYears.size ? selectedYears : new Set(availableYears);

  const filteredPlants = plants.filter((p) => region === "ALL" || p.region === region);
  const plantIds = new Set(filteredPlants.map((p) => p.id));
  const filteredRows = rows.filter(
    (r) => plantIds.has(r.plant_id) && effectiveYears.has(Number(r.date.slice(0, 4))),
  );
  const plantById = useMemo(() => new Map(filteredPlants.map((p) => [p.id, p])), [filteredPlants]);

  // Serie agregada por bucket (respeta granularidad)
  const agg = useMemo(() => aggregate(filteredRows, granularity), [filteredRows, granularity]);
  const sortedDates = agg.keys;
  const sortedValues = agg.values;

  // KPIs
  const kpis = useMemo(() => {
    if (!sortedValues.length) return { total: 0, media: 0, max: 0, min: 0, dias: 0 };
    return {
      total: sortedValues.reduce((a, b) => a + b, 0),
      media: sortedValues.reduce((a, b) => a + b, 0) / sortedValues.length,
      max: Math.max(...sortedValues),
      min: Math.min(...sortedValues),
      dias: sortedValues.length,
    };
  }, [sortedValues]);

  const regions = ["ALL", ...Array.from(new Set(plants.map((p) => p.region).filter(Boolean)))];

  // Curva de duración
  const durationData = useMemo(() => {
    const sorted = [...sortedValues].sort((a, b) => b - a);
    const labels = sorted.map((_, i) => `${((i / Math.max(sorted.length - 1, 1)) * 100).toFixed(0)}%`);
    return {
      labels,
      datasets: [{
        label: "MW ordenados",
        data: sorted,
        borderColor: color,
        backgroundColor: `${color}33`,
        fill: true,
        pointRadius: 0,
        tension: 0.1,
      }],
    };
  }, [sortedValues, color]);

  // Heatmap mes × año
  const heatmap = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>();
    for (const r of filteredRows) {
      const k = r.date.slice(0, 7);
      const cur = map.get(k) ?? { sum: 0, n: 0 };
      cur.sum += Number(r.mw); cur.n += 1;
      map.set(k, cur);
    }
    const years = Array.from(new Set([...map.keys()].map((k) => k.slice(0, 4)))).sort();
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
    let vmax = 0;
    const cells: Array<{ y: string; m: string; v: number | null }> = [];
    for (const y of years) for (const m of months) {
      const v = map.get(`${y}-${m}`);
      const avg = v ? v.sum / v.n : null;
      if (avg != null && avg > vmax) vmax = avg;
      cells.push({ y, m, v: avg });
    }
    return { years, months, cells, vmax };
  }, [filteredRows]);

  // Participación %
  const stacked = useMemo(() => {
    const perPlantTotal = new Map<string, number>();
    for (const r of filteredRows) perPlantTotal.set(r.plant_id, (perPlantTotal.get(r.plant_id) ?? 0) + Number(r.mw));
    const top = [...perPlantTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
    const topSet = new Set(top);
    const monthKeys = Array.from(new Set(filteredRows.map((r) => r.date.slice(0, 7)))).sort();
    const perMonthPerPlant = new Map<string, Map<string, number>>();
    for (const r of filteredRows) {
      const mk = r.date.slice(0, 7);
      const pid = topSet.has(r.plant_id) ? r.plant_id : "OTROS";
      let m = perMonthPerPlant.get(mk);
      if (!m) { m = new Map(); perMonthPerPlant.set(mk, m); }
      m.set(pid, (m.get(pid) ?? 0) + Number(r.mw));
    }
    const palette = [color, "#00B7C7", "#6C2C91", "#F97316", "#00B140", "#FFC20E", "#E4002B", "#0090D4", "#84cc16", "#ec4899", "#64748b"];
    const series = [...top, "OTROS"].map((pid, i) => ({
      label: pid === "OTROS" ? "Otras" : plantById.get(pid)?.name ?? pid.slice(0, 6),
      backgroundColor: palette[i] ?? "#64748b",
      data: monthKeys.map((mk) => {
        const m = perMonthPerPlant.get(mk); if (!m) return 0;
        const total = [...m.values()].reduce((a, b) => a + b, 0);
        return total ? ((m.get(pid) ?? 0) / total) * 100 : 0;
      }),
      stack: "s",
    }));
    return { labels: monthKeys, datasets: series };
  }, [filteredRows, plantById, color]);

  // Promedio móvil
  const movingAvg = useMemo(() => {
    const arr = sortedValues;
    const roll = (win: number) => arr.map((_, i) => {
      const s = Math.max(0, i - win + 1);
      const chunk = arr.slice(s, i + 1);
      return chunk.reduce((a, b) => a + b, 0) / chunk.length;
    });
    const min = arr.map((_, i) => Math.min(...arr.slice(Math.max(0, i - 29), i + 1)));
    const max = arr.map((_, i) => Math.max(...arr.slice(Math.max(0, i - 29), i + 1)));
    return {
      labels: sortedDates,
      datasets: [
        { label: "Max 30", data: max, borderColor: "transparent", backgroundColor: `${color}15`, fill: "+1", pointRadius: 0 },
        { label: "Min 30", data: min, borderColor: "transparent", backgroundColor: `${color}15`, fill: false, pointRadius: 0 },
        { label: "MA 7", data: roll(7), borderColor: color, borderWidth: 1.5, pointRadius: 0, fill: false },
        { label: "MA 30", data: roll(30), borderColor: "#FFC20E", borderWidth: 2, pointRadius: 0, fill: false, borderDash: [4, 4] },
      ],
    };
  }, [sortedDates, sortedValues, color]);

  // Anomalías
  const anomalies = useMemo(() => {
    if (sortedValues.length < 30) return { list: [], byDow: [] as number[], byMonth: [] as number[] };
    const win = 30;
    const dowCount = Array(7).fill(0);
    const moCount = Array(12).fill(0);
    const list: Array<{ date: string; mw: number; dow: string; dev: number }> = [];
    const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    for (let i = win; i < sortedValues.length; i++) {
      const w = sortedValues.slice(i - win, i);
      const mean = w.reduce((a, b) => a + b, 0) / w.length;
      const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / w.length);
      const x = sortedValues[i];
      if (sd > 0 && Math.abs(x - mean) > 2 * sd) {
        const d = new Date(sortedDates[i] + "T00:00");
        list.push({ date: sortedDates[i], mw: x, dow: DOW[d.getUTCDay()], dev: (x - mean) / sd });
        dowCount[d.getUTCDay()]++;
        moCount[d.getUTCMonth()]++;
      }
    }
    return { list: list.slice(-50).reverse(), byDow: dowCount, byMonth: moCount };
  }, [sortedDates, sortedValues]);

  const toggleYear = (y: number) => {
    const next = new Set(effectiveYears);
    if (next.has(y)) next.delete(y);
    else next.add(y);
    setSelectedYears(next);
  };

  const granularityLabel = granularity === "day" ? "diaria" : granularity === "week" ? "semanal" : "mensual";

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color }}>{TECH_LABEL[tech]}s — SEIN/COES</h1>
          <p className="text-sm text-slate-400">
            {filteredPlants.length} centrales · {filteredRows.length.toLocaleString()} registros
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="uppercase tracking-widest text-slate-400">Región</span>
          <select value={region} onChange={(e) => setRegion(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm">
            {regions.map((r) => <option key={r ?? "n"} value={r ?? ""}>{r === "ALL" ? "Todas" : r}</option>)}
          </select>
        </label>
      </header>

      <div className="mb-4">
        <ChartControls
          years={availableYears}
          selectedYears={effectiveYears}
          onToggleYear={toggleYear}
          granularity={granularity}
          onGranularityChange={setGranularity}
          accent={color}
        />
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Energía total" value={`${kpis.total.toLocaleString("es-PE", { maximumFractionDigits: 0 })} MW`} />
        <Kpi label={`Media ${granularityLabel}`} value={`${kpis.media.toFixed(1)} MW`} />
        <Kpi label="Máximo" value={`${kpis.max.toFixed(1)} MW`} accent="text-emerald-400" />
        <Kpi label="Mínimo" value={`${kpis.min.toFixed(1)} MW`} accent="text-rose-400" />
        <Kpi label="Puntos" value={kpis.dias.toString()} />
      </section>

      {filteredRows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center text-slate-500">
          Sin datos para los filtros seleccionados. Ve a <b>Cargar Excel</b> o activa más años.
        </div>
      ) : (
        <>
          <Card title={`Generación ${granularityLabel} agregada`}>
            <div className="h-[320px]">
              <Line
                data={{ labels: sortedDates, datasets: [{ label: "MW", data: sortedValues, borderColor: color, backgroundColor: `${color}33`, fill: true, tension: 0.25, pointRadius: 0 }] }}
                options={chartOpts()}
              />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Curva de duración">
              <div className="h-[280px]"><Line data={durationData} options={chartOpts()} /></div>
            </Card>
            <Card title="Promedio móvil 7 / 30 + banda min-máx">
              <div className="h-[280px]"><Line data={movingAvg} options={chartOpts()} /></div>
            </Card>
          </div>

          <Card title="Participación % mensual — Top 10 centrales">
            <div className="h-[320px]">
              <Bar
                data={stacked}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { labels: { color: "#cbd5e1", boxWidth: 10, font: { size: 10 } } } },
                  scales: {
                    x: { stacked: true, ticks: { color: "#94a3b8", maxTicksLimit: 12 }, grid: { color: "#1e293b" } },
                    y: { stacked: true, max: 100, ticks: { color: "#94a3b8", callback: (v) => `${v}%` }, grid: { color: "#1e293b" } },
                  },
                }}
              />
            </div>
          </Card>

          <Card title="Heatmap mes × año (MW promedio)">
            <Heatmap {...heatmap} color={color} />
          </Card>

          <Card title="Detección de anomalías (fuera de ±2σ de la media móvil 30)">
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1 text-xs uppercase tracking-widest text-slate-500">Frecuencia por día de la semana</div>
                <div className="h-[220px]">
                  <Bar
                    data={{
                      labels: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
                      datasets: [{ label: "Anomalías", data: anomalies.byDow, backgroundColor: color }],
                    }}
                    options={chartOpts()}
                  />
                </div>
                <div className="mt-3 mb-1 text-xs uppercase tracking-widest text-slate-500">Frecuencia por mes</div>
                <div className="h-[220px]">
                  <Bar
                    data={{
                      labels: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],
                      datasets: [{ label: "Anomalías", data: anomalies.byMonth, backgroundColor: "#FFC20E" }],
                    }}
                    options={chartOpts()}
                  />
                </div>
              </div>
              <div className="max-h-[500px] overflow-auto rounded-md border border-slate-800">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Fecha</th>
                      <th className="px-2 py-1.5 text-left">Día</th>
                      <th className="px-2 py-1.5 text-right">MW</th>
                      <th className="px-2 py-1.5 text-right">Desv (σ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.list.length === 0 && (
                      <tr><td colSpan={4} className="px-2 py-4 text-center text-slate-500">No hay anomalías detectadas.</td></tr>
                    )}
                    {anomalies.list.map((a) => (
                      <tr key={a.date} className="border-t border-slate-800">
                        <td className="px-2 py-1 font-mono">{a.date}</td>
                        <td className="px-2 py-1">{a.dow}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{a.mw.toFixed(1)}</td>
                        <td className={`px-2 py-1 text-right tabular-nums ${a.dev > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {a.dev.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card title="Top 15 centrales por energía acumulada">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-2 py-2 text-left">Código</th>
                    <th className="px-2 py-2 text-left">Central</th>
                    <th className="px-2 py-2 text-left">Empresa</th>
                    <th className="px-2 py-2 text-left">Región</th>
                    <th className="px-2 py-2 text-right">MW·d</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const totals = new Map<string, number>();
                    for (const r of filteredRows) totals.set(r.plant_id, (totals.get(r.plant_id) ?? 0) + Number(r.mw));
                    return filteredPlants
                      .map((p) => ({ ...p, total: totals.get(p.id) ?? 0 }))
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 15)
                      .map((p) => (
                        <tr key={p.id} className="border-t border-slate-800">
                          <td className="px-2 py-2 font-mono text-xs">{p.code}</td>
                          <td className="px-2 py-2 font-medium">{p.name}</td>
                          <td className="px-2 py-2 text-slate-400">{p.company ?? "—"}</td>
                          <td className="px-2 py-2 text-slate-400">{p.region ?? "—"}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {p.total.toLocaleString("es-PE", { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      ));
                  })()}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function chartOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#cbd5e1", font: { size: 10 } } } },
    scales: {
      x: { ticks: { color: "#94a3b8", maxTicksLimit: 10 }, grid: { color: "#1e293b" } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" } },
    },
  } as const;
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${accent ?? ""}`}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function Heatmap({ years, months, cells, vmax, color }: {
  years: string[]; months: string[]; cells: Array<{ y: string; m: string; v: number | null }>; vmax: number; color: string;
}) {
  const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const cellFor = (y: string, m: string) => cells.find((c) => c.y === y && c.m === m);
  if (!years.length) return <div className="text-sm text-slate-500">Sin datos.</div>;
  return (
    <div className="overflow-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="text-xs text-slate-500"></th>
            {months.map((m, i) => <th key={m} className="px-2 text-xs text-slate-400">{MONTHS_ES[i]}</th>)}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y}>
              <td className="pr-2 text-xs font-mono text-slate-400">{y}</td>
              {months.map((m) => {
                const c = cellFor(y, m);
                const v = c?.v ?? null;
                const alpha = v == null ? 0 : Math.max(0.08, v / (vmax || 1));
                return (
                  <td key={m} title={v != null ? `${y}-${m}: ${v.toFixed(1)} MW` : "sin datos"}
                    className="h-8 w-12 rounded text-center align-middle text-[10px] font-medium"
                    style={{ backgroundColor: v == null ? "#0f172a" : `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`, color: alpha > 0.5 ? "#0b1220" : "#cbd5e1" }}>
                    {v != null ? v.toFixed(0) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
