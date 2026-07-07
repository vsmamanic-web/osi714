import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  downloadMeasurementsTemplate,
  downloadPlantsTemplate,
  IN_SEIN,
  listPlants,
  listUploads,
} from "@/lib/centrales";
import {
  SHEETS_SOURCES,
  syncSheetSource,
  syncAllSources,
  revertUploadAdmin,
  wipeAllMeasurements,
  resetAndSyncAll,
  getDataStats,
} from "@/lib/dataAdmin.functions";
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
      <Toaster richColors position="top-right" />
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#00559E" }}>Sincronización de datos</h1>
          <p className="text-sm text-slate-500">
            Datos oficiales desde los Google Sheets conectados vía OAuth. Detecta automáticamente las pestañas de cada libro.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => downloadMeasurementsTemplate()}
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-100">
            ⬇ Plantilla mediciones
          </button>
          <button onClick={() => downloadPlantsTemplate()}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
            ⬇ Plantilla centrales
          </button>
        </div>
      </header>

      <StatsBar />

      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {(["sync", "centrales", "historial"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === t ? "bg-[#00559E] text-white" : "text-slate-600 hover:text-[#00559E]"}`}>
            {t === "sync" ? "1. Sincronizar Google Sheets" : t === "centrales" ? "2. Centrales actuales" : "3. Historial / Borrar"}
          </button>
        ))}
      </div>

      {tab === "sync" && <SheetsSyncPanel />}
      {tab === "centrales" && <PlantsMaster />}
      {tab === "historial" && <UploadHistory />}
    </div>
  );
}

function StatsBar() {
  const stats = useServerFn(getDataStats);
  const { data } = useQuery({ queryKey: ["data-stats"], queryFn: () => stats() });
  if (!data) return null;
  return (
    <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
      <div><div className="text-xs text-slate-500">Mediciones</div><div className="text-lg font-semibold text-[#00559E]">{data.measurements.toLocaleString()}</div></div>
      <div><div className="text-xs text-slate-500">Centrales</div><div className="text-lg font-semibold text-[#00559E]">{data.plants.toLocaleString()}</div></div>
      <div><div className="text-xs text-slate-500">Última carga</div><div className="text-lg font-semibold text-[#00559E]">{data.lastUpload ? new Date(data.lastUpload).toLocaleString("es-PE") : "—"}</div></div>
    </div>
  );
}

interface DetailRow { source: string; sheet: string; status: "ok" | "empty" | "error" | "catalog"; rows?: number; message?: string; }



function SheetsSyncPanel() {
  const qc = useQueryClient();
  const syncOne = useServerFn(syncSheetSource);
  const syncAll = useServerFn(syncAllSources);
  const resetSync = useServerFn(resetAndSyncAll);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<DetailRow[]>([]);
  const [totalInserted, setTotalInserted] = useState(0);
  const [showReset, setShowReset] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  async function handleSyncOne(key: string) {
    const src = SHEETS_SOURCES.find((s) => s.key === key);
    if (!src) return;
    setBusy(key); setLog([]); setTotalInserted(0);
    try {
      const res = await syncOne({ data: { key } });
      setTotalInserted(res.inserted);
      setLog(res.detail.map((d) => ({ source: res.source, ...d })));
      toast.success(`${res.source}: ${res.inserted.toLocaleString()} mediciones en ${res.sheets} pestaña(s).`);
      qc.invalidateQueries();
    } catch (err) {
      toast.error(`Error: ${(err as Error).message}`);
    } finally { setBusy(null); }
  }

  async function handleSyncAll() {
    setBusy("__all__"); setLog([]); setTotalInserted(0);
    try {
      const res = await syncAll();
      setTotalInserted(res.total);
      const flat: DetailRow[] = [];
      for (const s of res.sources) for (const d of s.detail) flat.push({ source: s.source, ...d });
      setLog(flat);
      toast.success(`Sincronización completa: ${res.total.toLocaleString()} mediciones.`);
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(null); }
  }

  async function handleResetAndSync() {
    if (resetConfirm !== "BORRAR TODO") { toast.error('Debes escribir exactamente "BORRAR TODO".'); return; }
    setBusy("__reset__"); setLog([]); setTotalInserted(0);
    try {
      const res = await resetSync({ data: { confirm: "BORRAR TODO" } });
      setTotalInserted(res.total);
      const flat: DetailRow[] = [];
      for (const s of res.sources) for (const d of s.detail) flat.push({ source: s.source, ...d });
      setLog(flat);
      toast.success(`Borrado (${res.wiped.measurementsDeleted.toLocaleString()} medic.) + Sincronización: ${res.total.toLocaleString()} nuevas.`);
      setShowReset(false); setResetConfirm("");
      qc.invalidateQueries();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(null); }
  }


  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Fuentes oficiales de datos</h2>
            <p className="text-xs text-slate-500">Los libros se leen con tu conexión Google autorizada. Pestañas detectadas automáticamente.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!!busy}
              onClick={handleSyncAll}
              className="rounded-lg bg-[#00559E] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#004585] disabled:opacity-50">
              {busy === "__all__" ? "⏳ Sincronizando todo…" : "🔄 Sincronizar todo"}
            </button>
            <button
              disabled={!!busy}
              onClick={() => setShowReset((v) => !v)}
              className="rounded-lg border-2 border-rose-500 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow hover:bg-rose-50 disabled:opacity-50">
              🔁 Borrar TODO y re-sincronizar
            </button>
          </div>
        </div>
        {showReset && (
          <div className="mb-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
            <p className="mb-2 text-sm text-rose-800">
              Se eliminarán <b>todas las mediciones e historial</b> antes de re-descargar los datos oficiales.
              Escribe <code className="rounded bg-white px-1 font-bold">BORRAR TODO</code> para confirmar:
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="BORRAR TODO"
                className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <button
                disabled={busy === "__reset__" || resetConfirm !== "BORRAR TODO"}
                onClick={handleResetAndSync}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {busy === "__reset__" ? "⏳ Procesando…" : "Confirmar reinicio"}
              </button>
              <button
                onClick={() => { setShowReset(false); setResetConfirm(""); }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-2">
          {SHEETS_SOURCES.map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">{s.label}</div>
                <div className="text-[11px] text-slate-500">
                  <span className="mr-2 rounded bg-slate-200 px-1.5 py-0.5 uppercase">{s.technology}</span>
                  <a href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit`}
                    target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">Ver hoja ↗</a>
                </div>
              </div>
              <button
                disabled={!!busy}
                onClick={() => handleSyncOne(s.key)}
                className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                {busy === s.key ? "⏳" : "Sincronizar"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {log.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Resultado</h3>
            <span className="text-xs text-slate-500">Total insertado: {totalInserted.toLocaleString()} mediciones</span>
          </div>
          <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>
                <th className="px-2 py-1 text-left">Fuente</th>
                <th className="px-2 py-1 text-left">Pestaña</th>
                <th className="px-2 py-1 text-left">Estado</th>
                <th className="px-2 py-1 text-right">Filas</th>
              </tr></thead>
              <tbody>
                {log.map((p, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1">{p.source}</td>
                    <td className="px-2 py-1 font-mono">{p.sheet}</td>
                    <td className={`px-2 py-1 ${p.status === "ok" ? "text-emerald-600" : p.status === "empty" ? "text-slate-400" : "text-rose-600"}`}>
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
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por código o nombre…"
          className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
        <select value={sysFilter} onChange={(e) => setSysFilter(e.target.value as typeof sysFilter)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="ALL">Todas ({plants.length})</option>
          <option value="SEIN">Dentro SEIN/COES</option>
          <option value="FUERA">Fuera del SEIN</option>
        </select>
      </div>
      <div className="max-h-[560px] overflow-auto rounded-md border border-slate-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>
            <th className="px-2 py-2 text-left">Código</th>
            <th className="px-2 py-2 text-left">Nombre</th>
            <th className="px-2 py-2 text-left">Tec.</th>
            <th className="px-2 py-2 text-left">Sist.</th>
            <th className="px-2 py-2 text-left">Región</th>
            <th className="px-2 py-2 text-right">Coord.</th>
          </tr></thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-2 py-1.5 font-mono">{p.code}</td>
                <td className="px-2 py-1.5">{p.name}</td>
                <td className="px-2 py-1.5">{p.technology}</td>
                <td className="px-2 py-1.5">{p.system}</td>
                <td className="px-2 py-1.5 text-slate-500">{p.region ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  {p.lat != null && p.lng != null
                    ? <span className="text-emerald-600">✓</span>
                    : <span className="text-slate-400">—</span>}
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
  const revertFn = useServerFn(revertUploadAdmin);
  const wipeFn = useServerFn(wipeAllMeasurements);
  const { data: uploads = [], isLoading, refetch } = useQuery({
    queryKey: ["uploads"], queryFn: () => listUploads(80),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showWipe, setShowWipe] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);

  async function handleRevert(id: string, name: string | null) {
    if (!confirm(`¿Revertir la carga "${name ?? id.slice(0, 8)}"? Se eliminarán solo las mediciones subidas en esta carga.`)) return;
    setBusyId(id);
    try {
      const res = await revertFn({ data: { uploadId: id } });
      toast.success(`Revertido: ${res.deleted.toLocaleString()} mediciones eliminadas.`);
      qc.invalidateQueries(); refetch();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusyId(null); }
  }

  async function handleWipeAll() {
    if (confirmText !== "BORRAR TODO") { toast.error('Debes escribir exactamente "BORRAR TODO".'); return; }
    setWiping(true);
    try {
      const res = await wipeFn({ data: { confirm: "BORRAR TODO" } });
      toast.success(`Eliminadas ${res.measurementsDeleted.toLocaleString()} mediciones y ${res.uploadsDeleted} cargas.`);
      setShowWipe(false); setConfirmText("");
      qc.invalidateQueries(); refetch();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setWiping(false); }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">Historial de sincronizaciones</h2>
          <button onClick={() => refetch()} className="text-xs text-sky-600 hover:underline">↻ Refrescar</button>
        </div>
        {isLoading ? (
          <div className="p-6 text-center text-sm text-slate-500">Cargando…</div>
        ) : uploads.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">Aún no hay cargas registradas.</div>
        ) : (
          <div className="overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500"><tr>
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
                  <tr key={u.id} className={`border-t border-slate-100 ${u.reverted_at ? "opacity-50" : ""}`}>
                    <td className="px-2 py-1.5 tabular-nums">{new Date(u.uploaded_at).toLocaleString("es-PE")}</td>
                    <td className="px-2 py-1.5 uppercase">{u.technology}</td>
                    <td className="px-2 py-1.5 text-slate-700">{u.filename ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{u.rows_inserted.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{u.plants_touched}</td>
                    <td className="px-2 py-1.5 text-center">
                      {u.reverted_at
                        ? <span className="rounded bg-rose-100 px-2 py-0.5 text-rose-700">Revertido</span>
                        : <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">Activo</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {u.reverted_at ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <button
                          disabled={busyId === u.id}
                          onClick={() => handleRevert(u.id, u.filename)}
                          className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-rose-700 hover:bg-rose-100 disabled:opacity-50">
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
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <b className="text-slate-800">Revertir</b> elimina únicamente las mediciones insertadas en esa carga específica (por <code>upload_id</code>). Los datos anteriores quedan intactos.
        </div>
      </section>

      <section className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-rose-700">Zona de peligro</h2>
        <p className="mb-3 text-sm text-rose-800">
          Borra <b>todas</b> las mediciones cargadas y su historial. El catálogo de centrales se conserva.
        </p>
        {!showWipe ? (
          <button
            onClick={() => setShowWipe(true)}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-rose-700">
            🗑 Borrar TODOS los datos cargados
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-rose-300 bg-white p-4">
            <p className="text-sm text-slate-800">
              Escribe <code className="rounded bg-slate-100 px-1 font-bold">BORRAR TODO</code> para confirmar:
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="BORRAR TODO"
            />
            <div className="flex gap-2">
              <button
                disabled={wiping || confirmText !== "BORRAR TODO"}
                onClick={handleWipeAll}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {wiping ? "Borrando…" : "Confirmar borrado"}
              </button>
              <button
                onClick={() => { setShowWipe(false); setConfirmText(""); }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
