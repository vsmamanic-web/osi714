import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listPlants, listUploads, TECH_COLOR, TECH_LABEL, type Technology } from "@/lib/centrales";
import { Droplets, Flame, Sun, Wind } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Resumen — SEIN BI" }] }),
  component: Overview,
});

const TECH_ICON: Record<Technology, typeof Droplets> = {
  hidro: Droplets,
  eolico: Wind,
  solar: Sun,
  termico: Flame,
  otro: Droplets,
};

function Overview() {
  const { data: plants = [] } = useQuery({ queryKey: ["plants"], queryFn: () => listPlants() });
  const { data: uploads = [] } = useQuery({ queryKey: ["uploads"], queryFn: () => listUploads(10) });

  const groups = (["hidro", "eolico", "solar", "termico"] as Technology[]).map((t) => ({
    tech: t,
    count: plants.filter((p) => p.technology === t).length,
  }));

  return (
    <div className="p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Resumen del SEIN</h1>
        <p className="text-sm text-slate-400">
          Plataforma unificada de análisis de centrales del Sistema Eléctrico Interconectado Nacional del Perú.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {groups.map(({ tech, count }) => {
          const Icon = TECH_ICON[tech];
          return (
            <Link
              key={tech}
              to="/tecnologia/$tech"
              params={{ tech }}
              className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-700 hover:bg-slate-900"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-slate-400">
                  {TECH_LABEL[tech]}
                </span>
                <div
                  className="grid h-9 w-9 place-items-center rounded-lg"
                  style={{ backgroundColor: `${TECH_COLOR[tech]}22`, color: TECH_COLOR[tech] }}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-3 text-3xl font-bold">{count}</div>
              <div className="mt-1 text-xs text-slate-500">centrales registradas</div>
            </Link>
          );
        })}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Últimas cargas de datos
          </h2>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Tecnología</th>
                  <th className="px-3 py-2 text-left">Archivo</th>
                  <th className="px-3 py-2 text-right">Filas</th>
                </tr>
              </thead>
              <tbody>
                {uploads.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Aún no se han cargado datos. Ve a{" "}
                      <Link to="/cargar" className="text-sky-400 underline">
                        Cargar Excel
                      </Link>
                      .
                    </td>
                  </tr>
                )}
                {uploads.map((u) => (
                  <tr key={u.id} className="border-t border-slate-800">
                    <td className="px-3 py-2">
                      {new Date(u.uploaded_at).toLocaleString("es-PE")}
                    </td>
                    <td className="px-3 py-2 uppercase">{u.technology}</td>
                    <td className="px-3 py-2 text-slate-400">{u.filename ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{u.rows_inserted.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Accesos rápidos
          </h2>
          <div className="mt-3 grid gap-2">
            <Link to="/cargar" className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-sm hover:border-sky-500">
              📥 Subir nuevo Excel de generación
            </Link>
            <Link to="/mapa" className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-sm hover:border-sky-500">
              🗺️ Ver mapa interactivo
            </Link>
            <Link to="/comparador" className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-sm hover:border-sky-500">
              📈 Comparador multi-año por central
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
