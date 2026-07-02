import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  dayOfPeriod,
  getMeasurementsByPlant,
  getMeasurementsByPlants,
  listPlants,
  periodCount,
  periodLabel,
  type Granularity,
} from "@/lib/centrales";
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
import { yearColor } from "@/components/ChartControls";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

export const Route = createFileRoute("/comparador")({
  head: () => ({ meta: [{ title: "Comparador multi-año — SEIN BI" }] }),
  component: Comparator,
});

function Comparator() {
  const { data: plants = [] } = useQuery({ queryKey: ["plants"], queryFn: () => listPlants() });
  return (
    <div className="p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Comparador multi-año</h1>
        <p className="text-sm text-slate-400">
          Superpone la evolución (MW) de varios años sobre el mismo eje temporal.
        </p>
      </header>
      <SinglePlantBlock plants={plants} />
      <MultiPlantBlock plants={plants} />
    </div>
  );
}

// -------------------------- Bloque 1: una central --------------------------
function SinglePlantBlock({ plants }: { plants: Array<{ id: string; code: string; name: string; technology: string; system: string }> }) {
  const [plantId, setPlantId] = useState<string>("");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const { data: meas = [] } = useQuery({
    queryKey: ["meas", plantId],
    queryFn: () => getMeasurementsByPlant(plantId),
    enabled: !!plantId,
  });

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const m of meas) ys.add(Number(m.date.slice(0, 4)));
    return [...ys].sort();
  }, [meas]);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  useEffect(() => { setSelectedYears(new Set(years)); }, [years.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const effectiveYears = selectedYears.size ? selectedYears : new Set(years);

  const chart = useMemo(() => {
    const N = periodCount(granularity);
    const byYear = new Map<number, { sum: number[]; n: number[] }>();
    for (const m of meas) {
      const y = Number(m.date.slice(0, 4));
      if (!effectiveYears.has(y)) continue;
      const k = dayOfPeriod(m.date, granularity);
      let s = byYear.get(y);
      if (!s) { s = { sum: Array(N + 1).fill(0), n: Array(N + 1).fill(0) }; byYear.set(y, s); }
      s.sum[k] += Number(m.mw); s.n[k] += 1;
    }
    const labels = Array.from({ length: N }, (_, i) => periodLabel(i + 1, granularity));
    const datasets = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, s], idx) => ({
      label: String(year),
      data: labels.map((_, i) => (s.n[i + 1] ? s.sum[i + 1] / s.n[i + 1] : null)),
      borderColor: yearColor(idx),
      backgroundColor: `${yearColor(idx)}22`,
      spanGaps: true, tension: 0.2, pointRadius: 0, borderWidth: 2,
    }));
    return { labels, datasets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meas, [...effectiveYears].join(","), granularity]);

  const yearSummary = useMemo(() => {
    const totals = new Map<number, number>();
    for (const m of meas) {
      const y = Number(m.date.slice(0, 4));
      if (!effectiveYears.has(y)) continue;
      totals.set(y, (totals.get(y) ?? 0) + Number(m.mw));
    }
    const sorted = [...totals.entries()].sort((a, b) => a[0] - b[0]);
    const base = sorted[0]?.[1] ?? 0;
    return sorted.map(([y, t]) => ({ year: y, total: t, diffAbs: t - base, diffPct: base ? ((t - base) / base) * 100 : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meas, [...effectiveYears].join(",")]);

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">1. Una central · varios años</h2>
      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[280px]">
            <label className="text-xs uppercase tracking-widest text-slate-400">Central</label>
            <select value={plantId} onChange={(e) => setPlantId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              <option value="">— Selecciona una central —</option>
              {plants.map((p) => (
                <option key={p.id} value={p.id}>[{p.code}] {p.name} · {p.technology} · {p.system}</option>
              ))}
            </select>
          </div>
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </div>
        <div className="flex flex-wrap gap-2">
          {years.length === 0 && <span className="text-xs text-slate-500">Sin datos para esta central</span>}
          {years.map((y, i) => {
            const active = effectiveYears.has(y);
            const c = yearColor(i);
            return (
              <button key={y}
                onClick={() => {
                  const next = new Set(effectiveYears);
                  if (next.has(y)) next.delete(y); else next.add(y);
                  setSelectedYears(next);
                }}
                className="rounded-md border px-3 py-1 text-xs font-semibold"
                style={{ borderColor: c, color: active ? "white" : c, background: active ? c : "transparent" }}>
                {y}
              </button>
            );
          })}
        </div>
        <div className="h-[420px]">
          {meas.length ? (
            <Line data={chart} options={commonOpts()} />
          ) : (
            <div className="grid h-full place-items-center text-slate-500">
              {plantId ? "No hay mediciones." : "Selecciona una central."}
            </div>
          )}
        </div>
      </div>

      {yearSummary.length > 1 && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Comparación entre años (vs {yearSummary[0].year})
          </h3>
          <SummaryTable summary={yearSummary} />
        </div>
      )}
    </section>
  );
}

// -------------------------- Bloque 2: varias centrales promediadas --------------------------
function MultiPlantBlock({ plants }: { plants: Array<{ id: string; code: string; name: string; technology: string; system: string }> }) {
  const [selectedPlantIds, setSelectedPlantIds] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [pickerFilter, setPickerFilter] = useState("");

  const { data: meas = [] } = useQuery({
    queryKey: ["multi-meas", selectedPlantIds.slice().sort().join(",")],
    queryFn: () => getMeasurementsByPlants(selectedPlantIds),
    enabled: selectedPlantIds.length > 0,
  });

  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const m of meas) ys.add(Number(m.date.slice(0, 4)));
    return [...ys].sort();
  }, [meas]);
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  useEffect(() => { setSelectedYears(new Set(years)); }, [years.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const effectiveYears = selectedYears.size ? selectedYears : new Set(years);

  const plantById = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);

  // Cobertura por central × año
  const coverage = useMemo(() => {
    const cov = new Map<string, Map<number, number>>();
    for (const m of meas) {
      const y = Number(m.date.slice(0, 4));
      let inner = cov.get(m.plant_id);
      if (!inner) { inner = new Map(); cov.set(m.plant_id, inner); }
      inner.set(y, (inner.get(y) ?? 0) + 1);
    }
    return cov;
  }, [meas]);

  const warnings: string[] = [];
  const yearsUsed = [...effectiveYears];
  for (const pid of selectedPlantIds) {
    const name = plantById.get(pid)?.name ?? pid.slice(0, 6);
    for (const y of yearsUsed) {
      const n = coverage.get(pid)?.get(y) ?? 0;
      if (n === 0) warnings.push(`${name}: sin datos en ${y}.`);
      else if (n < 300 && granularity === "day") warnings.push(`${name}: ${y} incompleto (${n} días).`);
    }
  }

  // Serie: por año, promedio de MW en la posición (day/week/month) considerando solo centrales con dato
  const chart = useMemo(() => {
    const N = periodCount(granularity);
    // clave: year -> array de {sum, n_plants}
    const byYear = new Map<number, { sum: number[]; nSet: Array<Set<string>> }>();
    for (const m of meas) {
      const y = Number(m.date.slice(0, 4));
      if (!effectiveYears.has(y)) continue;
      const k = dayOfPeriod(m.date, granularity);
      let s = byYear.get(y);
      if (!s) {
        s = { sum: Array(N + 1).fill(0), nSet: Array.from({ length: N + 1 }, () => new Set<string>()) };
        byYear.set(y, s);
      }
      s.sum[k] += Number(m.mw);
      s.nSet[k].add(m.plant_id);
    }
    const labels = Array.from({ length: N }, (_, i) => periodLabel(i + 1, granularity));
    const datasets = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, s], idx) => ({
      label: String(year),
      data: labels.map((_, i) => (s.nSet[i + 1].size ? s.sum[i + 1] / s.nSet[i + 1].size : null)),
      _plantCount: labels.map((_, i) => s.nSet[i + 1].size),
      borderColor: yearColor(idx),
      backgroundColor: `${yearColor(idx)}22`,
      spanGaps: true, tension: 0.2, pointRadius: 0, borderWidth: 2,
    }));
    return { labels, datasets };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meas, [...effectiveYears].join(","), granularity]);

  const yearSummary = useMemo(() => {
    // total promedio (por central) del año
    const perYear = new Map<number, { sum: number; plants: Set<string> }>();
    for (const m of meas) {
      const y = Number(m.date.slice(0, 4));
      if (!effectiveYears.has(y)) continue;
      const cur = perYear.get(y) ?? { sum: 0, plants: new Set<string>() };
      cur.sum += Number(m.mw); cur.plants.add(m.plant_id);
      perYear.set(y, cur);
    }
    const sorted = [...perYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ year: y, total: v.sum / Math.max(v.plants.size, 1) }));
    const base = sorted[0]?.total ?? 0;
    return sorted.map((s) => ({ ...s, diffAbs: s.total - base, diffPct: base ? ((s.total - base) / base) * 100 : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meas, [...effectiveYears].join(",")]);

  const filteredPlants = plants.filter((p) =>
    !pickerFilter || `${p.code} ${p.name}`.toLowerCase().includes(pickerFilter.toLowerCase()),
  );

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">2. Varias centrales · promedio anual</h2>
      <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[280px]">
            <label className="text-xs uppercase tracking-widest text-slate-400">Centrales seleccionadas ({selectedPlantIds.length})</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {selectedPlantIds.length === 0 && <span className="text-xs text-slate-500">Ninguna aún</span>}
              {selectedPlantIds.map((id) => {
                const p = plantById.get(id);
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-xs">
                    {p?.name ?? id.slice(0, 6)}
                    <button onClick={() => setSelectedPlantIds(selectedPlantIds.filter((x) => x !== id))} className="text-slate-400 hover:text-rose-400">×</button>
                  </span>
                );
              })}
            </div>
          </div>
          <GranularityToggle value={granularity} onChange={setGranularity} />
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <input value={pickerFilter} onChange={(e) => setPickerFilter(e.target.value)}
              placeholder="Buscar central por código o nombre…"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <div className="mt-1 max-h-40 overflow-auto rounded-md border border-slate-800">
              {filteredPlants.slice(0, 200).map((p) => {
                const active = selectedPlantIds.includes(p.id);
                return (
                  <button key={p.id}
                    onClick={() => {
                      if (active) setSelectedPlantIds(selectedPlantIds.filter((x) => x !== p.id));
                      else setSelectedPlantIds([...selectedPlantIds, p.id]);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-800 ${active ? "bg-slate-800/60 text-emerald-300" : "text-slate-300"}`}>
                    {active ? "✓ " : ""}[{p.code}] {p.name} · {p.technology}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-400">Años</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {years.length === 0 && <span className="text-xs text-slate-500">— sin datos —</span>}
              {years.map((y, i) => {
                const active = effectiveYears.has(y);
                const c = yearColor(i);
                return (
                  <button key={y}
                    onClick={() => {
                      const next = new Set(effectiveYears);
                      if (next.has(y)) next.delete(y); else next.add(y);
                      setSelectedYears(next);
                    }}
                    className="rounded-md border px-3 py-1 text-xs font-semibold"
                    style={{ borderColor: c, color: active ? "white" : c, background: active ? c : "transparent" }}>
                    {y}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-800/60 bg-amber-950/30 p-2 text-xs text-amber-300">
            ⚠ Datos incompletos: {warnings.slice(0, 5).join(" · ")}
            {warnings.length > 5 && ` (+${warnings.length - 5} más)`}. El promedio usa solo las centrales con datos en cada fecha.
          </div>
        )}

        <div className="h-[420px]">
          {selectedPlantIds.length === 0 ? (
            <div className="grid h-full place-items-center text-slate-500">Selecciona 2 o más centrales.</div>
          ) : meas.length === 0 ? (
            <div className="grid h-full place-items-center text-slate-500">Cargando…</div>
          ) : (
            <Line
              data={chart}
              options={{
                ...commonOpts(),
                plugins: {
                  ...commonOpts().plugins,
                  tooltip: {
                    callbacks: {
                      label: (ctx) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const nPlants = (ctx.dataset as any)._plantCount?.[ctx.dataIndex] ?? 0;
                        const v = ctx.parsed.y;
                        return `${ctx.dataset.label}: ${v?.toFixed(2) ?? "—"} MW · ${nPlants} central${nPlants === 1 ? "" : "es"}`;
                      },
                    },
                  },
                },
              }}
            />
          )}
        </div>
      </div>

      {yearSummary.length > 1 && (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Promedio por central: años vs {yearSummary[0].year}
          </h3>
          <SummaryTable summary={yearSummary} unit="MW" />
        </div>
      )}
    </section>
  );
}

// -------------------------- Utilidades --------------------------
function GranularityToggle({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-slate-800 p-0.5 text-xs">
      {(["day", "week", "month"] as const).map((g) => (
        <button key={g} onClick={() => onChange(g)}
          className="rounded px-3 py-1 uppercase tracking-widest"
          style={{ background: value === g ? "#00B7C7" : "transparent", color: value === g ? "white" : "#94a3b8" }}>
          {g === "day" ? "Diario" : g === "week" ? "Semanal" : "Mensual"}
        </button>
      ))}
    </div>
  );
}

function commonOpts() {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { labels: { color: "#cbd5e1" } },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2) ?? "—"} MW` } },
    },
    scales: {
      x: { ticks: { color: "#94a3b8", maxTicksLimit: 12 }, grid: { color: "#1e293b" } },
      y: { ticks: { color: "#94a3b8" }, grid: { color: "#1e293b" }, title: { display: true, text: "MW", color: "#94a3b8" } },
    },
  };
}

function SummaryTable({ summary, unit = "MW·d" }: {
  summary: Array<{ year: number; total: number; diffAbs: number; diffPct: number }>;
  unit?: string;
}) {
  return (
    <div className="mt-3 overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase text-slate-400">
          <tr>
            <th className="px-2 py-2 text-left">Año</th>
            <th className="px-2 py-2 text-right">Total ({unit})</th>
            <th className="px-2 py-2 text-right">Δ Absoluta</th>
            <th className="px-2 py-2 text-right">Δ %</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((s) => (
            <tr key={s.year} className="border-t border-slate-800">
              <td className="px-2 py-2 font-medium">{s.year}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.total.toFixed(0)}</td>
              <td className={`px-2 py-2 text-right tabular-nums ${s.diffAbs > 0 ? "text-emerald-400" : s.diffAbs < 0 ? "text-rose-400" : ""}`}>
                {s.diffAbs > 0 ? "+" : ""}{s.diffAbs.toFixed(0)}
              </td>
              <td className={`px-2 py-2 text-right tabular-nums ${s.diffPct > 0 ? "text-emerald-400" : s.diffPct < 0 ? "text-rose-400" : ""}`}>
                {s.diffPct > 0 ? "+" : ""}{s.diffPct.toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
