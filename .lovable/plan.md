## Contexto

- El conector Google Sheets (VANESA) sigue vinculado y funcional.
- Los 7 spreadsheets responden correctamente y la mayoría usa formato largo `codigo | nombre | fecha | mw`.
- Base actual: 196 mediciones + `data_uploads` residuales — a borrar antes de re-sincronizar.

## Bugs detectados al re-inspeccionar los libros

1. **Parser numérico corrompe MW**: los valores llegan con coma de miles (`"2,667.35"`). `toNumber` hace `.replace(",", ".")` → convierte `"2,667.35"` en `"2.667.35"` → parsea como `2.667`. Toda la sincronización previa quedó dividida por ~1000. Fix: `.replace(/,/g, "")` para eliminar comas de miles.
2. **DATOS_CENTRALES no se importa**: es un catálogo de centrales (columnas `codigo, nombre, tecnologia, sistema, empresa, region, potencia_instalada_mw, lat, lng, zona`). El parser genérico devuelve vacío porque no hay `fecha`. Se debe procesar en modo catálogo para enriquecer la tabla `plants` (región, potencia, lat/lng, empresa, tecnología correcta).
3. **Pestañas con espacio** (`"Hoja 1"` en CENTRALES_TERMICAS): el rango se envía sin escapar, funciona por accidente en Google. Añado `encodeURIComponent` solo al segmento del rango.

## Cambios

### 1. `src/lib/dataAdmin.functions.ts`

- **`toNumber` corregido**: eliminar comas de miles; solo tratar `,` como decimal si no hay `.`.
- **`parseCatalogSheet`** (nueva): para `DATOS_CENTRALES` — mapea `tecnologia → technology` (HIDROELÉCTRICA→hidro, EÓLICA→eolico, SOLAR→solar, TÉRMICA→termico), extrae `system, company, region, installed_mw, lat, lng` y hace upsert por `code` en `plants` (no toca `measurements`).
- **`syncSheetSource`** ramifica: si `key === "datos"` → parseo catálogo; resto → parseo mediciones actual (con `toNumber` arreglado).
- **`readSheetValues`**: escapar solo el segmento del rango, no el `!A1:ZZ...`.
- **Nueva server fn `resetAndSyncAll`** (opcional pero útil): en un solo click hace `wipeAllMeasurements` → luego `syncAllSources`. Devuelve resumen combinado.

### 2. `src/routes/cargar.tsx` — pestaña Sincronizar

- Botón nuevo: **"🔁 Borrar TODO y re-sincronizar"** (con doble confirmación "BORRAR TODO"), que llama a `resetAndSyncAll`.
- Se conserva el botón "Sincronizar todo" y los individuales.
- Log muestra fila especial para DATOS_CENTRALES con "N centrales actualizadas".

### 3. Descargas por sección (PDF / PNG / Excel)

Objetivo: que cada botón exporte **exactamente lo que está a la vista**, no un dataset global.

- **`src/routes/tecnologia.$tech.tsx`**:
  - Excel actual ya usa las series filtradas (bien). Añado hojas: `Ranking`, `Distribución potencia`, `Heatmap`, `Anomalías`, todas usando los `useMemo` visibles.
  - PDF: capturar `dashboardRef` está OK, pero antes de rasterizar hago scroll a top y espero un frame para que Chart.js redibuje; añado el título de la tecnología, filtros aplicados (región, años, granularidad) en el subtítulo.
  - PNG: idem — asegurar que captura todo el nodo del dashboard visible.
- **`src/routes/comparador.tsx`**:
  - Actualmente el PDF exporta solo el bloque completo. Añado botones locales de PDF/PNG/Excel dentro de cada sub-bloque (`Macrozona`, `Pronóstico`, `SinglePlant`, `MultiPlant`) que capturan su propio `ref` y su propio dataset (series exactas del gráfico + tabla mostrada).
- **`src/routes/reportes.tsx`**:
  - Añadir botones: exportar historial visible a Excel/PDF.
- **`src/lib/exportReport.ts`**:
  - `exportNodeAsPNG` usa `backgroundColor: "#0b1220"` (oscuro) — cambio a blanco para coherencia con el tema Osinergmin claro.
  - PDF ya usa fondo blanco, mantiene branding Osinergmin.

### 4. Sin cambios de esquema en la base de datos

`plants` ya tiene todas las columnas necesarias (`company`, `region`, `installed_mw`, `lat`, `lng`, `system`). No hay migración.

## Archivos

- Editar: `src/lib/dataAdmin.functions.ts` — fix numérico, parser catálogo, escape de rango, `resetAndSyncAll`.
- Editar: `src/routes/cargar.tsx` — botón reset+sync.
- Editar: `src/routes/tecnologia.$tech.tsx` — más hojas Excel + subtítulo PDF con filtros.
- Editar: `src/routes/comparador.tsx` — botones export por sub-bloque.
- Editar: `src/routes/reportes.tsx` — export historial.
- Editar: `src/lib/exportReport.ts` — fondo blanco en PNG.

## Flujo esperado para ti

1. Voy a `/cargar` → pestaña "Sincronizar Google Sheets".
2. Clic en **"🔁 Borrar TODO y re-sincronizar"** → escribes `BORRAR TODO` → confirma.
3. Corre wipe + 7 fuentes; DATOS_CENTRALES enriquece el catálogo (región, lat/lng, potencia).
4. En cada sección (Tecnología, Comparador, Reportes) los botones PDF/PNG/Excel descargan lo mismo que ves en pantalla.
