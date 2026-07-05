import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  downloadMeasurementsTemplate,
  downloadPlantsTemplate,
  IN_SEIN,
  listPlants,
  listUploads,
  revertUpload,
} from "@/lib/centrales";
import { SHEETS_SOURCES, syncAll, syncSource, type SyncProgress } from "@/lib/sheetsSync";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/cargar")({
  head: () => ({ meta: [{ title: "Sincronización de datos — SEIN BI" }] }),
  ssr: false,
  component: LoadPage,
});

function LoadPage() {
  const [tab, setTab] = useState<"sync" | "centrales" | "historial">("sync");
  return (
    <div className="p-6">
      <Toaster richColors theme="dark" position="top-right" />
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#00559E" }}>Sincronización de datos</h1>
          <p className="text-sm text-slate-400">
            Los datos se sincronizan automáticamente desde los Google Sheets oficiales. Cada libro publica una hoja por año.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => downloadMeasurementsTemplate()}
            className="rounded-lg border border-sky-700 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-300 hover:bg-sky-500/20">
            ⬇ Plantilla mediciones
          </button>
          <button onClick={() => downloadPlantsTemplate()}
            className="rounded-lg border border-emerald-700 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20">
            ⬇ Plantilla centrales
          </button>
        </div>
      </header>

      <div className="mb-4 inline-flex rounded-lg border border-slate-800 bg-slate-900/60 p-1">
        {(["sync", "centrales", "historial"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}>
            {t === "sync" ? "1. Sincronizar Google Sheets" : t === "centrales" ? "2. Centrales actuales" : "3. Historial / Revertir"}
          </button>
        ))}
      </div>

      {tab === "sync" && <SheetsSyncPanel />}
      {tab === "centrales" && <PlantsMaster />}
      {tab === "historial" && <UploadHistory />}
    </div>
  );
}

function SheetsSyncPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<SyncProgress[]>([]);
  const [totalInserted, setTotalInserted] = useState(0);

  const push = (p: SyncProgress) => setLog((prev) => [...prev, p]);

  async function handleSyncOne(key: string) {
    const src = SHEETS_SOURCES.find((s) => s.key === key);
    if (!src) return;
    setBusy(key); setLog([]);
    try {
      const { inserted, sheets } = await syncSource(src, push);
      setTotalInserted((t) => t + inserted);
      toast.success(`${src.label}: ${inserted.toLocaleString()} mediciones en ${sheets} hoja(s).`);
      qc.invalidateQueries();
    } catch (err) {
      toast.error(`Error sincronizando ${src.label}: ${(err as Error).message}`);
    } finally { setBusy(null); }
  }

  async function handleSyncAll() {
    setBusy("__all__"); setLog([]); setTotalInserted(0);
    try {
      const t = await syncAll(push);
      setTotalInserted(t);
      toast.success(`Sincronización completa: ${t.toLocaleString()} mediciones.`);
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Fuentes oficiales de datos</h2>
            <p className="text-xs text-slate-500">Cada Google Sheet debe estar publicado como <b>"Cualquiera con el enlace: Lector"</b>. El sistema detecta hojas por año (2020–{new Date().getFullYear()}).</p>
          </div>
          <button
            disabled={!!busy}
            onClick={handleSyncAll}
            className="rounded-lg bg-[#00559E] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#004585] disabled:opacity-50">
            {busy === "__all__" ? "⏳ Sincronizando todo…" : "🔄 Sincronizar todo"}
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {SHEETS_SOURCES.map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-200">{s.label}</div>
                <div className="text-[11px] text-slate-500">
                  <span className="mr-2 rounded bg-slate-800 px-1.5 py-0.5 uppercase">{s.technology}</span>
                  <a href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit`}
                    target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Ver hoja ↗</a>
                </div>
              </div>
              <button
                disabled={!!busy}
                onClick={() => handleSyncOne(s.key)}
                className="rounded-md border border-sky-700 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50">
                {busy === s.key ? "⏳" : "Sincronizar"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {log.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Progreso</h3>
            <span className="text-xs text-slate-500">Total insertado: {totalInserted.toLocaleString()} mediciones</span>
          </div>
          <div className="max-h-72 overflow-auto rounded-md border border-slate-800 bg-slate-950/60">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr>
                <th className="px-2 py-1 text-left">Fuente</th>
                <th className="px-2 py-1 text-left">Hoja</th>
                <th className="px-2 py-1 text-left">Estado</th>
                <th className="px-2 py-1 text-right">Filas</th>
              </tr></thead>
              <tbody>
                {log.map((p, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="px-2 py-1">{p.source}</td>
                    <td className="px-2 py-1 font-mono">{p.sheet}</td>
                    <td className={`px-2 py-1 ${p.status === "ok" ? "text-emerald-400" : p.status === "empty" ? "text-slate-500" : "text-rose-400"}`}>
                      {p.status === "ok" ? "✓ OK" : p.status === "empty" ? "vacía" : `✗ ${p.message ?? "error"}`}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{p.rows?.toLocaleString() ?? "—"}</td>
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

function PlantsMaster() {
  const { data: plants = [] } = useQuery({ queryKey: ["plants"], queryFn: () => listPlants() });
  const [filter, setFilter] = useState("");
  const [sysFilter, setSysFilter] = useState<"ALL" | "SEIN" | "FUERA">("ALL");
  const filtered = plants.filter((p) => {
    if (sysFilter === "SEIN" && !IN_SEIN.includes(p.system)) return false;
    if (sysFilter === "FUERA" && IN_SEIN.includes(p.system)) return false;
    if (filter && !(`${p.code} ${p.name}`.toLowerCase().includes(filter.toLowerCase()))) return false;
    return true;
  });
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por código o nombre…"
          className="min-w-[240px] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        <select value={sysFilter} onChange={(e) => setSysFilter(e.target.value as typeof sysFilter)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="ALL">Todas ({plants.length})</option>
          <option value="SEIN">Dentro SEIN/COES</option>
          <option value="FUERA">Fuera del SEIN</option>
        </select>
      </div>
      <div className="max-h-[560px] overflow-auto rounded-md border border-slate-800">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr>
            <th className="px-2 py-2 text-left">Código</th>
            <th className="px-2 py-2 text-left">Nombre</th>
            <th className="px-2 py-2 text-left">Tec.</th>
            <th className="px-2 py-2 text-left">Sist.</th>
            <th className="px-2 py-2 text-left">Región</th>
            <th className="px-2 py-2 text-right">Coord.</th>
          </tr></thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="px-2 py-1.5 font-mono">{p.code}</td>
                <td className="px-2 py-1.5">{p.name}</td>
                <td className="px-2 py-1.5">{p.technology}</td>
                <td className="px-2 py-1.5">{p.system}</td>
                <td className="px-2 py-1.5 text-slate-400">{p.region ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  {p.lat != null && p.lng != null
                    ? <span className="text-emerald-400">✓</span>
                    : <span className="text-slate-500">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        {filtered.length} de {plants.length} centrales · Cada central se identifica por su código único.
      </div>
    </section>
  );
}

function UploadHistory() {
  const qc = useQueryClient();
  const { data: uploads = [], isLoading, refetch } = useQuery({
    queryKey: ["uploads"], queryFn: () => listUploads(80),
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleRevert(id: string, name: string | null) {
    if (!confirm(`¿Revertir la carga "${name ?? id.slice(0, 8)}"? Se eliminarán solo las mediciones subidas en esta carga.`)) return;
    setBusyId(id);
    try {
      const { deleted } = await revertUpload(id);
      toast.success(`Revertido: ${deleted.toLocaleString()} mediciones eliminadas.`);
      qc.invalidateQueries(); refetch();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusyId(null); }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Historial de sincronizaciones</h2>
        <button onClick={() => refetch()} className="text-xs text-sky-400 hover:underline">↻ Refrescar</button>
      </div>
      {isLoading ? (
        <div className="p-6 text-center text-sm text-slate-500">Cargando…</div>
      ) : uploads.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">Aún no hay cargas registradas.</div>
      ) : (
        <div className="overflow-auto rounded-md border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900 text-slate-400"><tr>
              <th className="px-2 py-2 text-left">Fecha</th>
              <th className="px-2 py-2 text-left">Tecnología</th>
              <th className="px-2 py-2 text-left">Origen</th>
              <th className="px-2 py-2 text-right">Mediciones</th>
              <th className="px-2 py-2 text-right">Centrales</th>
              <th className="px-2 py-2 text-center">Estado</th>
              <th className="px-2 py-2 text-right">Acción</th>
            </tr></thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className={`border-t border-slate-800 ${u.reverted_at ? "opacity-50" : ""}`}>
                  <td className="px-2 py-1.5 tabular-nums">{new Date(u.uploaded_at).toLocaleString("es-PE")}</td>
                  <td className="px-2 py-1.5 uppercase">{u.technology}</td>
                  <td className="px-2 py-1.5 text-slate-300">{u.filename ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{u.rows_inserted.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{u.plants_touched}</td>
                  <td className="px-2 py-1.5 text-center">
                    {u.reverted_at
                      ? <span className="rounded bg-rose-500/20 px-2 py-0.5 text-rose-300">Revertido</span>
                      : <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">Activo</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {u.reverted_at ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <button
                        disabled={busyId === u.id}
                        onClick={() => handleRevert(u.id, u.filename)}
                        className="rounded border border-rose-700 bg-rose-500/10 px-2 py-0.5 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50">
                        {busyId === u.id ? "…" : "Revertir"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
        <b className="text-slate-200">Revertir</b> elimina únicamente las mediciones insertadas en esa carga específica (por <code>upload_id</code>). Los datos anteriores quedan intactos.
      </div>
    </section>
  );
}
