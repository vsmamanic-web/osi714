import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { listUploads } from "@/lib/centrales";
import { exportNodeAsPNG, exportReportPDF, exportRowsAsExcel } from "@/lib/exportReport";

export const Route = createFileRoute("/reportes")({
  head: () => ({ meta: [{ title: "Reportes — SEIN BI" }] }),
  component: Reports,
});

function Reports() {
  const { data: uploads = [] } = useQuery({ queryKey: ["uploads", "all"], queryFn: () => listUploads(100) });
  const ref = useRef<HTMLDivElement>(null);

  const handleExcel = () =>
    exportRowsAsExcel([{ name: "Historial", rows: uploads.map((u) => ({
      fecha: new Date(u.uploaded_at).toLocaleString("es-PE"),
      tecnologia: u.technology,
      archivo: u.filename ?? "",
      mediciones: u.rows_inserted,
      centrales: u.plants_touched,
      estado: u.reverted_at ? "revertido" : "activo",
    })) }], `historial_${new Date().toISOString().slice(0,10)}.xlsx`);

  const handlePDF = async () => {
    if (!ref.current) return;
    await exportReportPDF({
      title: "Historial de cargas",
      subtitle: `Generado ${new Date().toLocaleString("es-PE")} · ${uploads.length} registros`,
      sections: [{ title: "Cargas registradas", node: ref.current }],
      filename: `historial_${new Date().toISOString().slice(0,10)}.pdf`,
    });
  };

  const handlePNG = async () => { if (ref.current) await exportNodeAsPNG(ref.current, "historial.png"); };

  return (
    <div className="p-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#00559E" }}>Reportes y auditoría de cargas</h1>
          <p className="text-sm text-slate-500">Historial completo de sincronizaciones al sistema.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handlePNG} className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100">⬇ PNG</button>
          <button onClick={handleExcel} className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">⬇ Excel</button>
          <button onClick={handlePDF} className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">📄 PDF</button>
        </div>
      </header>
      <section ref={ref} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Fecha de carga</th>
              <th className="px-3 py-2 text-left">Tecnología</th>
              <th className="px-3 py-2 text-left">Archivo / origen</th>
              <th className="px-3 py-2 text-right">Mediciones</th>
              <th className="px-3 py-2 text-right">Centrales</th>
              <th className="px-3 py-2 text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {uploads.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Aún no hay sincronizaciones.</td></tr>
            )}
            {uploads.map((u) => (
              <tr key={u.id} className={`border-t border-slate-100 ${u.reverted_at ? "opacity-60" : ""}`}>
                <td className="px-3 py-2">{new Date(u.uploaded_at).toLocaleString("es-PE")}</td>
                <td className="px-3 py-2 uppercase">{u.technology}</td>
                <td className="px-3 py-2 text-slate-600">{u.filename ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.rows_inserted.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.plants_touched}</td>
                <td className="px-3 py-2 text-center">
                  {u.reverted_at
                    ? <span className="rounded bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Revertido</span>
                    : <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Activo</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

