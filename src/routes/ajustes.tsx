import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast, Toaster } from "sonner";
import { PALETTE_PRESETS, useTheme } from "@/lib/theme";
import { TECH_LABEL, type Palette, type Technology } from "@/lib/centrales";

export const Route = createFileRoute("/ajustes")({
  head: () => ({ meta: [{ title: "Paleta / Ajustes — SEIN BI" }] }),
  ssr: false,
  component: Ajustes,
});

function Ajustes() {
  const { palette, setPalette } = useTheme();
  const [draft, setDraft] = useState<Palette>(palette);
  const [saving, setSaving] = useState(false);

  const apply = async () => {
    setSaving(true);
    try {
      await setPalette(draft);
      toast.success("Paleta guardada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSaving(false); }
  };

  const TECHS: Technology[] = ["hidro", "eolico", "solar", "termico", "otro"];

  return (
    <div className="p-6">
      <Toaster richColors theme="dark" position="top-right" />
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Paleta / Ajustes</h1>
        <p className="text-sm text-slate-400">
          Personaliza los colores de cada tecnología. Se guarda en la nube y se aplica a todo el dashboard.
        </p>
      </header>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-xs uppercase tracking-widest text-slate-400">Presets</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(PALETTE_PRESETS).map(([key, p]) => (
            <button key={key}
              onClick={() => setDraft(p)}
              className={`rounded-md border px-3 py-2 text-sm ${draft.preset === key ? "border-sky-500 bg-sky-500/10" : "border-slate-700 hover:border-slate-500"}`}>
              <div className="mb-1 capitalize">{key}</div>
              <div className="flex gap-1">
                {(["hidro","eolico","solar","termico"] as Technology[]).map((t) => (
                  <span key={t} className="h-4 w-4 rounded" style={{ background: p[t] }} />
                ))}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-xs uppercase tracking-widest text-slate-400">Editar colores</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {TECHS.map((t) => (
            <label key={t} className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-950/40 p-3">
              <input
                type="color" value={draft[t]}
                onChange={(e) => setDraft({ ...draft, [t]: e.target.value, preset: "custom" })}
                className="h-10 w-14 cursor-pointer rounded border-0 bg-transparent" />
              <div>
                <div className="text-sm font-semibold">{TECH_LABEL[t]}</div>
                <div className="text-xs font-mono text-slate-400">{draft[t]}</div>
              </div>
            </label>
          ))}
          <label className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-950/40 p-3">
            <input
              type="color" value={draft.accent}
              onChange={(e) => setDraft({ ...draft, accent: e.target.value, preset: "custom" })}
              className="h-10 w-14 cursor-pointer rounded border-0 bg-transparent" />
            <div>
              <div className="text-sm font-semibold">Acento</div>
              <div className="text-xs font-mono text-slate-400">{draft.accent}</div>
            </div>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={apply} disabled={saving}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar y aplicar"}
          </button>
          <button onClick={() => setDraft(palette)}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:border-slate-500">
            Descartar
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-xs uppercase tracking-widest text-slate-400">Preview</h2>
        <div className="mt-2 grid gap-3 md:grid-cols-4">
          {(["hidro","eolico","solar","termico"] as Technology[]).map((t) => (
            <div key={t} className="rounded-lg p-4" style={{ background: `${draft[t]}22`, borderLeft: `4px solid ${draft[t]}` }}>
              <div className="text-xs uppercase tracking-widest" style={{ color: draft[t] }}>{TECH_LABEL[t]}</div>
              <div className="mt-1 text-2xl font-bold">1,234 MW</div>
              <div className="mt-1 text-xs text-slate-400">Ejemplo de KPI con este color</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
