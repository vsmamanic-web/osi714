# Plan integral de correcciones SEIN BI

## 1. Tema y paleta sin RLS (`src/lib/theme.tsx`, `src/lib/centrales.ts`, `src/routes/ajustes.tsx`)
- Reemplazar `getPalette`/`savePalette` (que golpean `user_settings`) por lectura/escritura en `localStorage` (`sein.palette.v1`).
- Eliminar el uso de `useQuery(['palette'])` con Supabase; `ThemeProvider` inicia sincronía leyendo `localStorage`, aplica variables CSS y persiste en cada `setPalette`.
- Quitar referencias a `user_settings` de `centrales.ts` (mantener el tipo `Palette` y `DEFAULT_PALETTE`). No se toca la tabla en DB (queda inutilizada, pero sin migración destructiva).

## 2. Caché y backoff para Google Sheets (`src/lib/dataAdmin.functions.ts`)
- Añadir `readSheetValues` con reintentos: si Google responde 429/5xx → espera `Retry-After` o backoff exponencial (500 ms → 8 s, máx 5 intentos).
- Nuevo cache server-side en memoria del Worker por `spreadsheetId+range` con TTL 5 min para evitar relecturas dentro de la misma sync.
- Consolidar: `batchGet` para leer varias pestañas del mismo spreadsheet en una sola llamada cuando corresponda.
- `syncAllSources` pasa a **secuencial con pausa 400 ms** entre spreadsheets (elimina ráfaga que dispara 429).
- Cliente (`cargar.tsx`, dashboards): usar `staleTime: 5 * 60_000` y `refetchOnWindowFocus: false` en TODAS las queries de `measurements`/`plants` para no re-consultar al cambiar de tab/filtro.

## 3. Estado de conexión por hoja (`src/lib/dataAdmin.functions.ts`, `src/routes/cargar.tsx`)
- Nueva server fn `checkSourcesHealth()` que hace un `spreadsheets.get` ligero (solo `properties.title`) a cada URL configurada y devuelve `{ key, status: 'connected'|'connecting'|'error', message }`.
- `cargar.tsx` muestra un panel "Estado de conexiones" con badge por hoja; al detectar `error`, ofrece botón "Reintentar" que reejecuta el check con backoff.
- Se ejecuta al montar `/cargar` y en `staleTime: 2 min`; no bloquea el resto de la UI.

## 4. Limpieza catálogo eólico
- Migración: `DELETE FROM public.plants WHERE technology='eolico' AND code = name` (borra los 13 registros basura junto con sus measurements por FK cascade — se añade `ON DELETE CASCADE` en `measurements.plant_id` si no existe).
- En `parseCatalogSheet` (DATOS_CENTRALES) validar: `code` debe matchear `/^\d+$/` y `code !== name`; si no, se omite la fila y se loguea.
- Frontend: en formularios de plantas (si existen inputs manuales) misma validación.

## 5. UPSERT de measurements (`src/lib/dataAdmin.functions.ts`)
- Cambiar los `insert` por `upsert({ onConflict: 'plant_id,date' })` para respetar el unique existente.
- Confirmar que el índice único `measurements_plant_id_date_key` existe (ya lo indica el error).

## 6. Selector dinámico de años
- Nueva server fn `listAvailableYears()` que hace `SELECT DISTINCT EXTRACT(YEAR FROM date) FROM measurements ORDER BY 1`.
- Reemplazar los arrays hardcodeados de años en `tecnologia.$tech.tsx`, `comparador.tsx`, `reportes.tsx` por `useQuery(['years'], listAvailableYears)`.
- Adicionalmente, en sync leer también años desde nombres de pestañas (`/^\d{4}$/`) para exponerlos aunque aún no haya mediciones — se guardan implícitamente al importar.

## 7. Exportación PDF fiel al dashboard (`src/lib/exportReport.ts`, dashboards)
- Nuevo helper `exportDashboardPDF(node, { title, filters })`: hace `html2canvas` de todo el `dashboardRef` (KPIs + gráficos + tablas + filtros aplicados renderizados como chips), pagina automáticamente si excede A4, mantiene branding Osinergmin en cabecera/pie.
- Reemplaza la variante "resumen" actual en `tecnologia.$tech.tsx`, `comparador.tsx`, `reportes.tsx`, `mapa.tsx` (mapa se rasteriza con `leaflet-image` o fallback `html2canvas` sobre el contenedor).
- Antes de capturar: scroll a top del nodo + `await new Promise(r=>requestAnimationFrame(r))` doble para asegurar redibujo Chart.js.

## 8. Mapa integrado en Comparador Multi-Año (`src/routes/comparador.tsx`)
- Agregar panel lateral con Leaflet inicializado solo con las centrales del filtro activo.
- Estado compartido `selectedPlantId` (Zustand ligero o `useState` a nivel de página):
  - clic en marcador → setSelected → tabla/gráficos filtran y hacen scroll al ítem.
  - selección en tabla/gráfico → marcador se resalta (`setStyle` + `openPopup`).
- Popup del marcador: código, nombre, tecnología, región, empresa, potencia MW, coord real/aprox.

## 9. Validación final
- Correr build (`tsgo`) + smoke con Playwright: abrir `/`, `/cargar`, `/comparador`, cambiar paleta en `/ajustes`, verificar 0 errores en consola y sin llamadas a `user_settings`.
- Verificar quota: log del server debe mostrar `cache hit` en la segunda navegación.

## Archivos a editar
- `src/lib/theme.tsx` — localStorage.
- `src/lib/centrales.ts` — quitar getPalette/savePalette Supabase.
- `src/lib/dataAdmin.functions.ts` — backoff, cache, upsert, batchGet, checkSourcesHealth, listAvailableYears, validación catálogo.
- `src/lib/exportReport.ts` — `exportDashboardPDF` completo.
- `src/routes/cargar.tsx` — panel estado + retirar user_settings.
- `src/routes/comparador.tsx` — mapa + sync bidireccional + PDF completo + años dinámicos.
- `src/routes/tecnologia.$tech.tsx` — años dinámicos + PDF completo.
- `src/routes/reportes.tsx` — años dinámicos + PDF completo.
- `src/routes/ajustes.tsx` — ya usa `useTheme`, solo se ajusta la persistencia.

## Migración DB (única)
```sql
-- limpiar registros basura
DELETE FROM public.plants
 WHERE technology='eolico' AND code = name;
-- cascada al borrar plants (si no existe)
ALTER TABLE public.measurements
  DROP CONSTRAINT IF EXISTS measurements_plant_id_fkey,
  ADD  CONSTRAINT measurements_plant_id_fkey
       FOREIGN KEY (plant_id) REFERENCES public.plants(id) ON DELETE CASCADE;
```

## Flujo esperado
1. Cambias paleta en `/ajustes` → se guarda al instante en localStorage, sin errores RLS.
2. `/cargar` muestra el estado de las 7 hojas; sincroniza con caché + backoff, sin 429.
3. Catálogo eólico queda limpio, códigos numéricos.
4. Filtros de año se rellenan solos desde la BD/pestañas.
5. Cualquier "Exportar PDF" produce copia fiel del dashboard visible.
6. Comparador tiene mapa sincronizado bidireccionalmente.
