import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Droplets,
  FileSpreadsheet,
  Flame,
  LayoutDashboard,
  Map as MapIcon,
  Sun,
  Upload,
  Wind,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getLastUpdate } from "@/lib/centrales";
import { useState, type ReactNode } from "react";

const NAV = [
  { to: "/", label: "Resumen", icon: LayoutDashboard },
  { to: "/tecnologia/hidro", label: "Hidroeléctricas", icon: Droplets },
  { to: "/tecnologia/eolico", label: "Eólicas", icon: Wind },
  { to: "/tecnologia/solar", label: "Solares", icon: Sun },
  { to: "/tecnologia/termico", label: "Térmicas", icon: Flame },
  { to: "/mapa", label: "Mapa", icon: MapIcon },
  { to: "/comparador", label: "Comparador multi-año", icon: BarChart3 },
  { to: "/reportes", label: "Reportes", icon: Activity },
  { to: "/cargar", label: "Cargar Excel", icon: Upload },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(true);
  const { data: last } = useQuery({
    queryKey: ["last-update"],
    queryFn: getLastUpdate,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside
        className={`${open ? "w-64" : "w-16"} shrink-0 border-r border-slate-800 bg-slate-900/80 transition-all duration-200`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-500 text-base font-bold">
            ⚡
          </div>
          {open && (
            <div className="leading-tight">
              <div className="text-sm font-bold">SEIN BI</div>
              <div className="text-[10px] uppercase tracking-widest text-sky-300">
                Generación Perú
              </div>
            </div>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Toggle sidebar"
          >
            <FileSpreadsheet className="h-4 w-4" />
          </button>
        </div>
        <nav className="mt-2 flex flex-col gap-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to || (to !== "/" && path.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-sky-500/15 text-sky-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                }`}
                title={label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {open && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>
        {open && (
          <div className="mt-6 px-3 text-[10px] uppercase tracking-widest text-slate-500">
            Última actualización
          </div>
        )}
        {open && (
          <div className="mx-3 mt-1 rounded-md border border-slate-800 bg-slate-950/50 p-2 text-xs">
            {last ? (
              <>
                <div className="font-semibold text-emerald-300">
                  {new Date(last.uploaded_at).toLocaleString("es-PE")}
                </div>
                <div className="mt-0.5 text-slate-400">
                  {last.technology.toUpperCase()} · {last.filename ?? "—"}
                </div>
              </>
            ) : (
              <div className="text-slate-500">Sin cargas todavía</div>
            )}
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
