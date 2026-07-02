// Controles compartidos: multi-select de años + granularidad D/S/M.
import type { Granularity } from "@/lib/centrales";

interface Props {
  years: number[];
  selectedYears: Set<number>;
  onToggleYear: (y: number) => void;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  accent?: string;
}

const YEAR_COLORS = ["#0090D4", "#00B140", "#FFC20E", "#E4002B", "#6C2C91", "#00B7C7", "#F97316"];

export function yearColor(i: number) {
  return YEAR_COLORS[i % YEAR_COLORS.length];
}

export function ChartControls({
  years,
  selectedYears,
  onToggleYear,
  granularity,
  onGranularityChange,
  accent = "#00B7C7",
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="uppercase tracking-widest text-slate-500">Años</span>
        {years.length === 0 && <span className="text-slate-500">— sin datos —</span>}
        {years.map((y, i) => {
          const active = selectedYears.has(y);
          const c = yearColor(i);
          return (
            <button
              key={y}
              onClick={() => onToggleYear(y)}
              className="rounded-md border px-2 py-0.5 font-semibold transition-colors"
              style={{
                borderColor: c,
                color: active ? "white" : c,
                background: active ? c : "transparent",
              }}
            >
              {y}
            </button>
          );
        })}
      </div>
      <div className="ml-auto flex items-center gap-1 rounded-md border border-slate-800 p-0.5">
        {(["day", "week", "month"] as const).map((g) => (
          <button
            key={g}
            onClick={() => onGranularityChange(g)}
            className="rounded px-2 py-0.5 uppercase tracking-widest"
            style={{
              background: granularity === g ? accent : "transparent",
              color: granularity === g ? "white" : "#94a3b8",
            }}
          >
            {g === "day" ? "Diario" : g === "week" ? "Semanal" : "Mensual"}
          </button>
        ))}
      </div>
    </div>
  );
}
