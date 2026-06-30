import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as XLSX from "xlsx";
import { uploadMeasurements, type Technology } from "@/lib/centrales";
import { toast } from "sonner";
import { Toaster } from "sonner";

export const Route = createFileRoute("/cargar")({
  head: () => ({ meta: [{ title: "Cargar Excel — SEIN BI" }] }),
  ssr: false,
  component: UploadPage,
});

const TECHS: Technology[] = ["hidro", "eolico", "solar", "termico"];

// Convierte un valor de la columna fecha a ISO yyyy-mm-dd.
function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Serial de Excel
    const date = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // dd/mm/yyyy
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function UploadPage() {
  const [tech, setTech] = useState<Technology>("eolico");
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
      let totalPlantsTouched = 0;
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        if (!aoa.length) continue;

        // Detectar fila de cabecera (contiene "Fecha" o equivalente)
        let headerRow = -1;
        for (let i = 0; i < Math.min(aoa.length, 6); i++) {
          const row = aoa[i] || [];
          if (row.some((c) => /fecha|date/i.test(String(c ?? "")))) {
            headerRow = i;
            break;
          }
        }
        if (headerRow < 0) {
          push(`⚠ "${sheetName}": no se detectó fila de cabecera con "Fecha".`);
          continue;
        }
        const headers = aoa[headerRow].map((c) => String(c ?? "").trim());
        const dateIdx = headers.findIndex((h) => /fecha|date/i.test(h));

        // Saltar filas de meta (Lugar, Tipo, Tecnología, etc.)
        let firstDataRow = headerRow + 1;
        while (firstDataRow < aoa.length) {
          const first = String(aoa[firstDataRow]?.[dateIdx] ?? "").trim().toLowerCase();
          if (/^(lugar|tipo|tecnolog)/i.test(first)) firstDataRow++;
          else break;
        }

        const rows: Array<{ plantName: string; date: string; mw: number }> = [];
        for (let r = firstDataRow; r < aoa.length; r++) {
          const row = aoa[r];
          if (!row || row.length === 0) continue;
          const iso = toISODate(row[dateIdx]);
          if (!iso) continue;
          for (let c = 0; c < headers.length; c++) {
            if (c === dateIdx) continue;
            const name = headers[c];
            if (!name) continue;
            const v = row[c];
            const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
            if (!Number.isFinite(n)) continue;
            rows.push({ plantName: name, date: iso, mw: n });
          }
        }
        if (!rows.length) {
          push(`⚠ "${sheetName}": 0 filas válidas.`);
          continue;
        }
        push(`📤 "${sheetName}": insertando ${rows.length.toLocaleString()} mediciones...`);
        const { inserted, plantsTouched } = await uploadMeasurements({
          technology: tech,
          filename: `${file.name} [${sheetName}]`,
          rows,
        });
        totalInserted += inserted;
        totalPlantsTouched = Math.max(totalPlantsTouched, plantsTouched);
        push(`✅ "${sheetName}": ${inserted.toLocaleString()} OK, ${plantsTouched} centrales.`);
      }
      push(`🏁 Total: ${totalInserted.toLocaleString()} mediciones.`);
      toast.success(`Carga completada: ${totalInserted.toLocaleString()} mediciones.`);
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
    <div className="p-6">
      <Toaster richColors theme="dark" position="top-right" />
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Cargar Excel</h1>
        <p className="text-sm text-slate-400">
          Los datos se guardan permanentemente. Selecciona la tecnología antes de subir el archivo.
          Formato esperado: una hoja por año (2024, 2025, …) con columna <code>Fecha</code> y una
          columna por central con los MW diarios.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
          <div>
            <label className="text-xs uppercase tracking-widest text-slate-400">Tecnología</label>
            <select
              value={tech}
              onChange={(e) => setTech(e.target.value as Technology)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            >
              {TECHS.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-slate-400">Archivo .xlsx</label>
            <div className="mt-1 flex items-center gap-3">
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold hover:border-sky-500 ${
                  busy ? "pointer-events-none opacity-50" : ""
                }`}
              >
                📂 Seleccionar archivo
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-xs text-slate-400">{fileName || "Sin archivo"}</span>
              {busy && <span className="text-xs text-sky-400">⏳ Procesando…</span>}
            </div>
          </div>
        </div>
        {log.length > 0 && (
          <pre className="mt-4 max-h-72 overflow-auto rounded-md border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-300">
            {log.join("\n")}
          </pre>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Estructura esperada del Excel
        </h2>
        <ul className="mt-2 list-disc pl-5 text-slate-300">
          <li>Una hoja por año (ej. <b>2024</b>, <b>2025</b>, <b>2026</b>).</li>
          <li>
            Primera columna: <code>Fecha</code> (formato Excel, <code>dd/mm/yyyy</code> o{" "}
            <code>yyyy-mm-dd</code>).
          </li>
          <li>
            Una columna por central (ej. <code>DUNA</code>, <code>WAYRA-I</code>, etc.). Las filas
            de “Lugar” y “Tipo” se omiten automáticamente.
          </li>
          <li>Si una central no existe aún, se crea con la tecnología seleccionada.</li>
        </ul>
      </section>
    </div>
  );
}
