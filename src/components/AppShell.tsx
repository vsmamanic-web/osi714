import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Droplets,
  FileSpreadsheet,
  Flame,
  Globe,
  LayoutDashboard,
  Map as MapIcon,
  Palette as PaletteIcon,
  Sun,
  Upload,
  Wind,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getLastUpdate } from "@/lib/centrales";
import { useState, type ReactNode } from "react";
import osiLogo from "@/assets/osinergmin-logo.png";


const NAV = [
  { to: "/", label: "Resumen", icon: LayoutDashboard },
  { to: "/tecnologia/hidro", label: "Hidroeléctricas", icon: Droplets },
  { to: "/tecnologia/eolico", label: "Eólicas", icon: Wind },
  { to: "/tecnologia/solar", label: "Solares", icon: Sun },
  { to: "/tecnologia/termico", label: "Térmicas", icon: Flame },
  { to: "/mapa", label: "Mapa", icon: MapIcon },
  { to: "/comparador", label: "Comparador multi-año", icon: BarChart3 },
  { to: "/fuera-sein", label: "Fuera del SEIN", icon: Globe },
  { to: "/reportes", label: "Reportes", icon: Activity },
  { to: "/cargar", label: "Cargar Excel", icon: Upload },
  { to: "/ajustes", label: "Paleta / Ajustes", icon: PaletteIcon },
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
    <div className="flex min-h-screen bg-[#f4f7fb] text-[#0b2e5b]">
      <aside
        className={`${open ? "w-64" : "w-16"} shrink-0 border-r border-slate-200 bg-white shadow-sm transition-all duration-200`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-3">
          <img
            src={osiLogo}
            alt="Osinergmin"
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-md bg-white object-contain"
          />
          {open && (
            <div className="leading-tight">
              <div className="text-sm font-bold text-[#00559e]">SEIN BI</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#f39f30]">
                Osinergmin · Perú
              </div>
            </div>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#00559e]"
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
                className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#00559e] text-white shadow-sm"
                    : "text-slate-600 hover:bg-[#e6f2fb] hover:text-[#00559e]"
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
