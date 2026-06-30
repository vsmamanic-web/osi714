import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listUploads } from "@/lib/centrales";

export const Route = createFileRoute("/reportes")({
  head: () => ({ meta: [{ title: "Reportes — SEIN BI" }] }),
  component: Reports,
});

function Reports() {
  const { data: uploads = [] } = useQuery({ queryKey: ["uploads", "all"], queryFn: () => listUploads(100) });

  return (
    <div className="p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Reportes y auditoría de cargas</h1>
        <p className="text-sm text-slate-400">
          Historial completo de archivos Excel cargados al sistema.
        </p>
      </header>
      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left">Fecha de carga</th>
              <th className="px-3 py-2 text-left">Tecnología</th>
              <th className="px-3 py-2 text-left">Archivo</th>
              <th className="px-3 py-2 text-right">Mediciones</th>
              <th className="px-3 py-2 text-right">Centrales</th>
            </tr>
          </thead>
          <tbody>
            {uploads.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  Aún no se han cargado archivos.
                </td>
              </tr>
            )}
            {uploads.map((u) => (
              <tr key={u.id} className="border-t border-slate-800">
                <td className="px-3 py-2">{new Date(u.uploaded_at).toLocaleString("es-PE")}</td>
                <td className="px-3 py-2 uppercase">{u.technology}</td>
                <td className="px-3 py-2 text-slate-400">{u.filename ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.rows_inserted.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.plants_touched}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
