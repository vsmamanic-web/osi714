
# Plan de expansión SEIN BI (Fase 3)

Es un cambio grande — lo divido en 6 bloques claros. Antes de escribir código quiero confirmar contigo lo esencial.

## 1. Identidad visual Osinergmin
- Nuevo preset "Osinergmin Institucional" y **por defecto**:
  - Azul institucional `#00559E`, turquesa `#00B6F1`, amarillo `#FFD400`, celeste `#7DA9DD`, gris `#D8D9DA`, naranja `#F39F30`.
- Tipografía: Calibri con fallback a Carlito (libre) e Inter.
- Botones/tarjetas: bordes redondeados suaves, sombra ligera, mucho blanco.
- Logo oficial en sidebar (subiré los assets que enviaste con `lovable-assets`).
- Se mantiene el selector de paleta en Ajustes.

## 2. Gráficas nuevas por tecnología (Hidro/Eólico/Solar/Térmico y Fuera-SEIN)
Añadir a cada sección:
1. **Heatmap avanzado** con toggle Semanal / Mensual por año, cubriendo TODAS las centrales de la sección.
2. **Distribución por potencia instalada** (histograma).
3. **Días de operación activa vs inactiva** por central (barras apiladas). Inactivo = MW=0 o sin dato.
4. **Ranking Top Centrales por generación** (MWh promedio diario).
5. **Evolución anual por central** (líneas, un año = un punto por central, o serie multi-año).
6. **Coeficiente de Variación por central** (barras, ordenado desc, mayor = más intermitente).

Colores estandarizados para tipos de gráfico (heatmap azul→amarillo→rojo, ranking en azul institucional, CV en naranja, etc.).

## 3. Carga de datos: nuevo flujo desde Google Sheets
Reemplazo total del panel `/cargar`:
- **Elimino** el flujo antiguo de subida manual de mediciones.
- **Mantengo**: descargar plantillas y botón de revertir cargas.
- **Nuevo**: sección "Sincronizar desde Google Sheets". Configuro las 7 URLs que enviaste (una constante `SHEETS_SOURCES`). Cada libro tiene hojas por año (2023, 2024…). Botón "Sincronizar ahora" que descarga cada hoja con `gviz/tq?tqx=out:csv&sheet=<año>`, parsea filas `codigo, nombre, fecha, mw` y hace upsert por (código, fecha).
- **Nueva plantilla adicional** con las 7 pestañas (una por libro fuente) para descargar como referencia del formato esperado.
- La lista de centrales actuales aparece con su código y sistema.

> **Importante**: los Google Sheets deben ser **públicos ("cualquiera con el enlace, lector")** para que el navegador los pueda leer sin OAuth. Si prefieres OAuth por usuario, agrega ~1 día adicional. Confírmame que están públicos.

## 4. Comparador rediseñado
- Toggle Diario / Semanal / Mensual global.
- **Comparativo por Macrozona** (Norte / Centro / Sur, derivado de `region` con mapping), filtrable por tecnología, multi-año superpuesto.
- **Comparador avanzado multi-central**: promedio simple por período y una línea por año. (Ya existe el promedio; agrego selector multi-año y línea por año.)
- **Detección y pronóstico de bajas**:
  - Detecta meses recurrentes con MW por debajo del promedio histórico (>1σ).
  - Proyección año actual con media móvil estacional + tendencia lineal (implementación cliente, sin dependencia extra pesada).
  - Alertas visuales + indicador de riesgo Bajo/Medio/Alto (según % desviación proyectada vs histórico).
- **Tooltip enriquecido**, leyenda interactiva (activar/desactivar años), export a **PNG** (canvas nativo de Chart.js) y **Excel** (xlsx ya instalado) por gráfica.

## 5. Reportes PDF por Excel/dashboard
- Nuevo botón "Exportar informe PDF" en cada sección de tecnología y en Comparador.
- Genera PDF (jspdf + html2canvas) con: portada Osinergmin, KPIs, capturas de gráficos y análisis textual auto-generado (top central, CV promedio, meses con baja, riesgo).

## 6. Rendimiento
- Chart.js con `decimation` plugin activo (LTTB) para series >2000 puntos.
- Agregaciones memoizadas en `useMemo` con clave estable.
- Queries Supabase paginadas por chunks (ya en 100/500) — ok.

---

## Detalle técnico

**Nuevos archivos**
- `src/lib/sheetsSync.ts` — fetch CSV desde gviz, parseo y upsert.
- `src/lib/forecasting.ts` — media móvil estacional, riesgo.
- `src/lib/exportReport.ts` — PDF + PNG + XLSX helpers.
- `src/components/TechDashboard.tsx` — bloque reusable con las 6 gráficas nuevas.
- `src/components/MacrozoneCompare.tsx`.

**Edits**
- `src/lib/theme.tsx` (+ preset institucional por defecto).
- `src/styles.css` (fuente Carlito/Calibri).
- `src/routes/cargar.tsx` (reemplazo del panel).
- `src/routes/comparador.tsx` (macrozona + forecast + export).
- `src/routes/tecnologia.$tech.tsx` y `src/routes/fuera-sein.tsx` (nuevas gráficas + export).

**Sin migración de BD** — el esquema actual alcanza.

**Dependencias nuevas**: `jspdf`, `html2canvas`, `chartjs-plugin-decimation` (viene con chart.js core, sólo activarlo).

---

## Confirmación que necesito antes de codear

1. **Google Sheets públicos** (cualquiera con enlace = lector): ¿confirmado? Si no, necesito que los hagas públicos o pasar a OAuth.
2. **Mapeo de macrozonas**: ¿ok si uso este por región peruana?
   - Norte: Tumbes, Piura, Lambayeque, La Libertad, Cajamarca, Amazonas, San Martín, Loreto
   - Centro: Áncash, Lima, Callao, Ica, Huánuco, Pasco, Junín, Huancavelica, Ucayali
   - Sur: Ayacucho, Apurímac, Cusco, Arequipa, Moquegua, Tacna, Puno, Madre de Dios
3. **Flujo antiguo de carga manual**: confirmo que lo **elimino por completo** y sólo queda "Sincronizar desde Google Sheets" + Plantillas + Revertir.

Con esas 3 respuestas arranco la implementación de un tirón.
