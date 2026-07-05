// Contexto de paleta de colores, persistido en la nube.
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_PALETTE,
  getPalette,
  savePalette,
  type Palette,
  type Technology,
} from "@/lib/centrales";

interface Ctx {
  palette: Palette;
  setPalette: (p: Palette) => Promise<void>;
  colorFor: (tech: Technology) => string;
}

const ThemeCtx = createContext<Ctx>({
  palette: DEFAULT_PALETTE,
  setPalette: async () => {},
  colorFor: (t) => DEFAULT_PALETTE[t] ?? DEFAULT_PALETTE.otro,
});

export const PALETTE_PRESETS: Record<string, Palette> = {
  osinergmin_institucional: DEFAULT_PALETTE,
  osinergmin_vivo: {
    preset: "osinergmin_vivo",
    hidro: "#0090D4", eolico: "#00B140", solar: "#FFC20E",
    termico: "#E4002B", otro: "#6C2C91", accent: "#00B7C7",
  },
  corporativo: {
    preset: "corporativo",
    hidro: "#1e40af", eolico: "#0f766e", solar: "#b45309",
    termico: "#7f1d1d", otro: "#475569", accent: "#3b82f6",
  },
  contraste: {
    preset: "contraste",
    hidro: "#00e5ff", eolico: "#00ff88", solar: "#ffd600",
    termico: "#ff1744", otro: "#e0e0e0", accent: "#ffffff",
  },
  calido: {
    preset: "calido",
    hidro: "#06b6d4", eolico: "#84cc16", solar: "#f97316",
    termico: "#dc2626", otro: "#a3a3a3", accent: "#fb923c",
  },
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data: palette = DEFAULT_PALETTE } = useQuery({
    queryKey: ["palette"],
    queryFn: getPalette,
    staleTime: 60_000,
  });

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--tech-hidro", palette.hidro);
    root.style.setProperty("--tech-eolico", palette.eolico);
    root.style.setProperty("--tech-solar", palette.solar);
    root.style.setProperty("--tech-termico", palette.termico);
    root.style.setProperty("--tech-otro", palette.otro);
    root.style.setProperty("--accent", palette.accent);
  }, [palette]);

  const value: Ctx = {
    palette,
    setPalette: async (p) => {
      await savePalette(p);
      qc.setQueryData(["palette"], p);
    },
    colorFor: (t) => palette[t] ?? palette.otro,
  };
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

export function useTechColor(t: Technology): string {
  return useContext(ThemeCtx).colorFor(t);
}
