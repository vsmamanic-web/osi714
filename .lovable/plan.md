## Problema actual

- La sincronización desde Google Sheets (`src/lib/sheetsSync.ts`) llama a `gviz` desde el navegador: los libros deben ser 100% públicos, adivina nombres de pestañas ("2020"…año actual, "Hoja1") y las escrituras a la base van con el cliente del navegador. Como las políticas RLS exigen `auth.uid() IS NOT NULL` para INSERT/DELETE y no hay sesión iniciada, **la sincronización y la reversión fallan en silencio**. Por eso "Revertir" no borra nada.
- No existe un botón para eliminar todas las mediciones cargadas.

## Solución

### 1. Conectar Google Sheets vía OAuth
Vinculo el conector oficial `google_sheets` (una sola vez, con tu cuenta Google). Ya no importa si las hojas son públicas o privadas.

### 2. Mover Sheets + escrituras a Server Functions (con admin)
Creo `src/lib/dataAdmin.functions.ts` con TanStack `createServerFn` (bypass RLS con `supabaseAdmin`):

- `syncSheetSource({ key })` — enumera pestañas reales del libro con `GET /v4/spreadsheets/{id}?fields=sheets.properties.title`, descarga cada una con `values/{sheet}!A1:Z100000`, parsea (formato largo `codigo,fecha,mw` y formato ancho `fecha + una col por central`), upserta centrales por código y hace insert de mediciones con `upload_id`. Devuelve progreso por pestaña.
- `syncAllSheetSources()` — recorre las 7 fuentes.
- `revertUploadAdmin({ uploadId })` — elimina mediciones por `upload_id` y marca `reverted_at`. Funciona siempre (bypass RLS).
- `wipeAllMeasurements({ confirm: "BORRAR TODO" })` — TRUNCATE `measurements` + `data_uploads`. **No** toca `plants` (catálogo se conserva).
- `wipeTechnologyMeasurements({ technology })` — opcional futuro.

Las llamadas al conector usan el gateway:
```
https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/{id}/...
Authorization: Bearer $LOVABLE_API_KEY
X-Connection-Api-Key: $GOOGLE_SHEETS_API_KEY
```

### 3. Rediseño de la pestaña "Historial / Revertir" en `/cargar`
- Botones de sincronización llaman a las nuevas server fns con `useServerFn` (progreso en vivo).
- Botón **"Revertir"** por carga ahora usa `revertUploadAdmin` (funciona).
- Nueva zona de peligro con botón **"Borrar TODOS los datos cargados"** (doble confirmación: modal + escribir "BORRAR TODO"). Elimina mediciones y cargas; mantiene el catálogo de centrales.
- Añado indicador global: total de mediciones y última sincronización.

### 4. Limpieza
- `src/lib/sheetsSync.ts` (browser) queda como thin wrapper que solo re-exporta `SHEETS_SOURCES` y llama a la server fn.
- El botón "Sincronizar todo" y por-fuente pasan al mismo flujo server-side.
- Sin cambios de esquema en la base de datos.

## Archivos

- Nuevo: `src/lib/dataAdmin.functions.ts` (server functions con `supabaseAdmin` + gateway Google Sheets)
- Editar: `src/lib/sheetsSync.ts` (mantener solo `SHEETS_SOURCES` y tipos, remover fetch directo)
- Editar: `src/routes/cargar.tsx` (usar server fns, botón Borrar todo, mejorar UX de progreso)
- Editar: `src/lib/centrales.ts` (delegar `revertUpload` a la nueva server fn)

## Notas de seguridad

Los endpoints admin quedan expuestos sin autenticación (igual que el resto de la app hoy). Si más adelante quieres restringir a un admin real, añadimos `requireSupabaseAuth` + tabla `user_roles`. Lo dejo anotado en la memoria de seguridad.