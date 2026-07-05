// Proyección simple estacional + tendencia lineal para pronosticar bajas.
export type Risk = "Bajo" | "Medio" | "Alto";

export interface ForecastPoint {
  date: string;
  actual: number | null;
  forecast: number | null;
  histAvg: number;
  drop: boolean;
}

/** Detecta meses recurrentes con MW por debajo de la media histórica. */
export function seasonalMonthlyProfile(byMonth: number[][]): { mean: number[]; std: number[] } {
  // byMonth[m] = array de valores en ese mes (0-11)
  const mean = byMonth.map((v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0));
  const std = byMonth.map((v, i) => {
    if (v.length < 2) return 0;
    const mu = mean[i];
    return Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length);
  });
  return { mean, std };
}

/** Proyecta 12 meses del año actual usando promedio estacional + tendencia lineal por año. */
export function forecastCurrentYear(monthlyByYear: Map<number, number[]>): {
  months: number[]; forecast: (number | null)[]; histAvg: number[]; risk: Risk[];
} {
  const years = [...monthlyByYear.keys()].sort();
  if (years.length < 1) return { months: [], forecast: [], histAvg: [], risk: [] };
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const y of years) {
    const arr = monthlyByYear.get(y)!;
    for (let m = 0; m < 12; m++) if (Number.isFinite(arr[m]) && arr[m] > 0) byMonth[m].push(arr[m]);
  }
  const { mean, std } = seasonalMonthlyProfile(byMonth);

  // Tendencia lineal anual (total anual vs año)
  const anualTotals = years.map((y) => (monthlyByYear.get(y) ?? []).reduce((a, b) => a + (b || 0), 0));
  const n = years.length;
  const sx = years.reduce((a, b) => a + b, 0);
  const sy = anualTotals.reduce((a, b) => a + b, 0);
  const sxy = years.reduce((acc, y, i) => acc + y * anualTotals[i], 0);
  const sxx = years.reduce((a, y) => a + y * y, 0);
  const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx || 1) : 0;
  const intercept = n > 1 ? (sy - slope * sx) / n : sy / Math.max(n, 1);
  const anualBase = anualTotals[anualTotals.length - 1] || 1;
  const currentYear = new Date().getFullYear();
  const anualForecast = slope * currentYear + intercept;
  const growth = anualBase ? anualForecast / anualBase : 1;

  const forecast = mean.map((m) => (m ? m * growth : null));
  const risk: Risk[] = forecast.map((f, i) => {
    if (f == null || mean[i] === 0) return "Bajo";
    const deviation = (mean[i] - f) / (std[i] || mean[i] || 1);
    if (deviation > 1) return "Alto";
    if (deviation > 0.3) return "Medio";
    return "Bajo";
  });
  return { months: Array.from({ length: 12 }, (_, i) => i + 1), forecast, histAvg: mean, risk };
}
