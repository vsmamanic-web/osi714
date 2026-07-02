import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as XLSX from "xlsx";
import {
  downloadMeasurementsTemplate,
  downloadPlantsTemplate,
  IN_SEIN,
  listPlants,
  listUploads,
  revertUpload,
  SYSTEM_LABEL,
  upsertPlants,
  uploadMeasurements,
  type System,
  type Technology,
} from "@/lib/centrales";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/cargar")({
  head: () => ({ meta: [{ title: "Cargar Excel — SEIN BI" }] }),
  ssr: false,
  component: UploadPage,
});

const TECHS: Technology[] = ["hidro", "eolico", "solar", "termico"];
const SYSTEMS: System[] = ["SEIN", "COES", "AISLADO", "OTRO"];

// ---------- helpers ----------
function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const date = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// ---------- main component (tabs) ----------
function UploadPage() {
  const [tab, setTab] = useState<"mediciones" | "coords" | "maestro">("mediciones");
  return (
    <div className="p-6">
      <Toaster richColors theme="dark" position="top-right" />
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Cargar Excel</h1>
        <p className="text-sm text-slate-400">
          Los datos se guardan permanentemente en la nube. Usa las pestañas para subir mediciones,
          actualizar coordenadas y metadatos, o revisar el estado del maestro.
        </p>
      </header>

      <div className="mb-4 inline-flex rounded-md border border-slate-800 bg-slate-900/60 p-1">
        {(["mediciones", "coords", "maestro"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1.5 text-sm ${
              tab === t ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t === "mediciones" ? "1. Mediciones" : t === "coords" ? "2. Coordenadas / metadatos" : "3. Estado del maestro"}
          </button>
        ))}
      </div>

      {tab === "mediciones" && <MeasurementsUploader />}
      {tab === "coords" && <CoordsUploader />}
      {tab === "maestro" && <PlantsMaster />}
    </div>
  );
}

// ---------- (1) mediciones ----------
function MeasurementsUploader() {
  const [tech, setTech] = useState<Technology>("eolico");
  const [system, setSystem] = useState<System>("SEIN");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const qc = useQueryClient();

  async function handleFile(file: File) {
    setBusy(true);
    setFileName(file.name);
    const msgs: string[] = [];
    const push = (m: string) => {
      msgs.push(m);
      setLog([...msgs]);
    };
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      let totalInserted = 0;
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        if (!aoa.length) continue;

        // Detectar cabeceras. Espera dos filas de cabecera contiguas:
        //   Fila A: CÓDIGO_1  CÓDIGO_2  ... (o vacío)
        //   Fila B: Fecha     NOMBRE_1  NOMBRE_2 ...
        // O una sola fila con nombres, si no hay códigos (fallback: se usa el nombre como código).
        let headerRow = -1;
        for (let i = 0; i < Math.min(aoa.length, 8); i++) {
          const row = aoa[i] || [];
          if (row.some((c) => /^\s*fecha|date\s*$/i.test(String(c ?? "")))) {
            headerRow = i;
            break;
          }
        }
        if (headerRow < 0) {
          push(`⚠ "${sheetName}": no se detectó fila con "Fecha".`);
          continue;
        }
        const headerNames = aoa[headerRow].map((c) => String(c ?? "").trim());
        const dateIdx = headerNames.findIndex((h) => /^fecha|date$/i.test(h));
        // Fila de códigos: la fila inmediata anterior si tiene valores en columnas de datos
        const codeRow = headerRow > 0 ? aoa[headerRow - 1] || [] : [];
        const hasCodeRow = codeRow.some(
          (c, i) => i !== dateIdx && String(c ?? "").trim() !== "",
        );
        const codes = headerNames.map((name, i) => {
          if (i === dateIdx) return "";
          const codeVal = hasCodeRow ? String(codeRow[i] ?? "").trim() : "";
          return codeVal || name; // fallback: nombre = código
        });

        // Saltar filas meta
        let firstDataRow = headerRow + 1;
        while (firstDataRow < aoa.length) {
          const first = String(aoa[firstDataRow]?.[dateIdx] ?? "").trim().toLowerCase();
          if (/^(lugar|tipo|tecnolog|c[oó]digo|potencia|empresa)/i.test(first)) firstDataRow++;
          else break;
        }

        const rows: Array<{ plantCode: string; plantName: string; date: string; mw: number }> = [];
        for (let r = firstDataRow; r < aoa.length; r++) {
          const row = aoa[r];
          if (!row || row.length === 0) continue;
          const iso = toISODate(row[dateIdx]);
          if (!iso) continue;
          for (let c = 0; c < headerNames.length; c++) {
            if (c === dateIdx) continue;
            const name = headerNames[c];
            const code = codes[c];
            if (!name && !code) continue;
            const v = row[c];
            const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
            if (!Number.isFinite(n)) continue;
            rows.push({ plantCode: code, plantName: name || code, date: iso, mw: n });
          }
        }
        if (!rows.length) {
          push(`⚠ "${sheetName}": 0 filas válidas.`);
          continue;
        }
        push(`📤 "${sheetName}": ${rows.length.toLocaleString()} mediciones (${hasCodeRow ? "con códigos" : "sin códigos — usando nombres"}).`);
        const { inserted, plantsTouched } = await uploadMeasurements({
          technology: tech,
          system,
          filename: `${file.name} [${sheetName}]`,
          rows,
        });
        totalInserted += inserted;
        push(`✅ "${sheetName}": ${inserted.toLocaleString()} OK · ${plantsTouched} centrales.`);
      }
      push(`🏁 Total: ${totalInserted.toLocaleString()} mediciones.`);
      toast.success(`Carga completada: ${totalInserted.toLocaleString()}`);
      qc.invalidateQueries();
    } catch (err) {
      console.error(err);
      push(`❌ Error: ${(err as Error).message}`);
      toast.error(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm">
          <span className="text-xs uppercase tracking-widest text-slate-400">Tecnología</span>
          <select value={tech} onChange={(e) => setTech(e.target.value as Technology)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
            {TECHS.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs uppercase tracking-widest text-slate-400">Sistema (por defecto para centrales nuevas)</span>
          <select value={system} onChange={(e) => setSystem(e.target.value as System)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
            {SYSTEMS.map((s) => <option key={s} value={s}>{SYSTEM_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-xs uppercase tracking-widest text-slate-400">Archivo .xlsx</span>
          <div className="mt-1 flex items-center gap-3">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-4 py-2 font-semibold hover:border-sky-500 ${busy ? "pointer-events-none opacity-50" : ""}`}>
              📂 Seleccionar
              <input type="file" accept=".xlsx,.xls" hidden disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            </label>
            <span className="text-xs text-slate-400">{fileName || "Sin archivo"}</span>
            {busy && <span className="text-xs text-sky-400">⏳</span>}
          </div>
        </label>
      </div>

      {log.length > 0 && (
        <pre className="mt-4 max-h-72 overflow-auto rounded-md border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">
          {log.join("\n")}
        </pre>
      )}

      <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
        <b className="text-slate-200">Formato esperado:</b> una hoja por año.
        Fila 1 (opcional): <code>CÓDIGO_A CÓDIGO_B …</code> alineado con los nombres.
        Fila 2: <code>Fecha  NOMBRE_A  NOMBRE_B …</code>. Filas meta (Lugar/Tipo/Potencia) se ignoran.
        El matching se hace por <b>código</b>; si no existe, la central se crea con la tecnología y sistema seleccionados.
      </div>
    </section>
  );
}

// ---------- (2) coordenadas ----------
function CoordsUploader() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const qc = useQueryClient();

  async function handleFile(file: File) {
    setBusy(true);
    const msgs: string[] = [];
    const push = (m: string) => { msgs.push(m); setLog([...msgs]); };
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
      push(`📄 ${rows.length} filas leídas de "${wb.SheetNames[0]}".`);
      const norm = rows.map((r) => {
        const key = (...names: string[]) => {
          for (const n of names) {
            const k = Object.keys(r).find((k) => k.toLowerCase().trim() === n.toLowerCase());
            if (k != null && r[k] != null && r[k] !== "") return r[k];
          }
          return null;
        };
        const code = String(key("codigo", "código", "code") ?? "").trim();
        if (!code) return null;
        const techRaw = String(key("tecnologia", "tecnología", "technology", "tipo") ?? "").toLowerCase();
        const tech = (techRaw.startsWith("hidr") ? "hidro"
          : techRaw.startsWith("eol") || techRaw.startsWith("eól") ? "eolico"
          : techRaw.startsWith("sol") ? "solar"
          : techRaw.startsWith("term") || techRaw.startsWith("térm") ? "termico"
          : undefined) as Technology | undefined;
        const sysRaw = String(key("sistema", "system") ?? "").toUpperCase();
        const system = (["SEIN", "COES", "AISLADO", "OTRO"].includes(sysRaw) ? sysRaw : undefined) as System | undefined;
        return {
          code,
          name: key("nombre", "name", "central") ? String(key("nombre", "name", "central")) : undefined,
          technology: tech,
          system,
          company: key("empresa", "company") ? String(key("empresa", "company")) : null,
          region: key("region", "región") ? String(key("region", "región")) : null,
          lat: (() => { const v = key("lat", "latitud", "latitude"); return v != null ? Number(v) : null; })(),
          lng: (() => { const v = key("lng", "long", "longitud", "longitude"); return v != null ? Number(v) : null; })(),
          installed_mw: (() => { const v = key("potencia_mw", "potencia", "installed_mw", "mw"); return v != null ? Number(v) : null; })(),
        };
      }).filter(Boolean) as Array<{ code: string }>;
      push(`🧩 ${norm.length} filas válidas (con código).`);
      const { updated, inserted } = await upsertPlants(norm);
      push(`✅ Actualizadas ${updated}, nuevas ${inserted}.`);
      toast.success(`Maestro actualizado: ${updated + inserted} centrales.`);
      qc.invalidateQueries();
    } catch (err) {
      console.error(err);
      push(`❌ ${(err as Error).message}`);
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">Coordenadas y metadatos</h2>
      <div className="mt-3 flex items-center gap-3">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold hover:border-sky-500 ${busy ? "pointer-events-none opacity-50" : ""}`}>
          📂 Seleccionar Excel
          <input type="file" accept=".xlsx,.xls" hidden disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </label>
        {busy && <span className="text-xs text-sky-400">⏳ Procesando…</span>}
      </div>
      <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
        <b className="text-slate-200">Columnas soportadas (case-insensitive):</b>
        <div className="mt-1">
          <code>Codigo</code> · <code>Nombre</code> · <code>Tecnologia</code> · <code>Sistema</code> ·
          <code> Empresa</code> · <code>Region</code> · <code>Lat</code> · <code>Lng</code> · <code>Potencia_MW</code>
        </div>
        <div className="mt-1">Sistema válido: <code>SEIN</code>, <code>COES</code>, <code>AISLADO</code>, <code>OTRO</code>.</div>
      </div>
      {log.length > 0 && (
        <pre className="mt-4 max-h-72 overflow-auto rounded-md border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">
          {log.join("\n")}
        </pre>
      )}
    </section>
  );
}

// ---------- (3) estado del maestro ----------
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
          className="flex-1 min-w-[240px] rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        <select value={sysFilter} onChange={(e) => setSysFilter(e.target.value as typeof sysFilter)}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
          <option value="ALL">Todas ({plants.length})</option>
          <option value="SEIN">Dentro SEIN/COES</option>
          <option value="FUERA">Fuera del SEIN</option>
        </select>
      </div>
      <div className="max-h-[520px] overflow-auto rounded-md border border-slate-800">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-400">
            <tr>
              <th className="px-2 py-2 text-left">Código</th>
              <th className="px-2 py-2 text-left">Nombre</th>
              <th className="px-2 py-2 text-left">Tec.</th>
              <th className="px-2 py-2 text-left">Sist.</th>
              <th className="px-2 py-2 text-left">Región</th>
              <th className="px-2 py-2 text-right">Coord.</th>
            </tr>
          </thead>
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
        {filtered.length} de {plants.length} centrales.
        Coord ✓ = ubicación real cargada; — = usará posición aproximada por región.
      </div>
    </section>
  );
}
