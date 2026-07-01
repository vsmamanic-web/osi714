
# Fase 2 — Ampliación del dashboard SEIN BI

## 1. Esquema de base de datos (migración)

Ajustes a la tabla `plants`:
- Nueva columna `system` (`SEIN` | `COES` | `AISLADO` | `OTRO`) con default `SEIN`.
- Se conservan `lat`, `lng`, `code`. `code` pasa a ser `UNIQUE` para poder matchear por código en la carga.
- Precarga de coordenadas conocidas para las centrales principales del SEIN (hidros y eólicas grandes: Mantaro, Restitución, Charcani, Machupicchu, Cerro del Águila, Wayra, Marcona, Tres Hermanas, Duna, Huambos, etc.). Las que no se encuentren se dejan en `NULL` para que las completes con Excel.

Nueva tabla `user_settings` (fila única, `id = 'global'`) para guardar la paleta de colores activa y otras preferencias visuales de forma persistente en la nube.

## 2. Cargadores en `/cargar`

Tres bloques en tabs:

**a) Mediciones diarias** (el que ya existe, mejorado)
- El Excel de generación debe traer columna nueva **`Código`** además de `Central`.
- Matching por `code` primero; si no existe, se crea con ese código y su nombre.
- Se ignoran filas de metadatos (Lugar/Tipo/σ) como ya hoy.

**b) Coordenadas de centrales**
- Excel con columnas: `Código`, `Nombre`, `Lat`, `Lng`, `Región`, `Sistema` (SEIN/COES/AISLADO/OTRO), `Empresa`, `Potencia_MW`.
- Update por código; crea las que falten.

**c) Estado del maestro**
- Tabla con todas las centrales cargadas, su código, sistema, si tienen o no coordenadas, y contador de mediciones. Sirve para auditar qué falta.

## 3. Nuevas gráficas por módulo de tecnología (`/tecnologia/$tech`)

Todo dentro del módulo SEIN/COES (los "fuera" tienen su propia página, ver §5).

- **Curva de duración** — MW ordenados de mayor a menor, con líneas de percentil P10/P50/P90.
- **Heatmap mes × año** — matriz de calor con energía mensual promedio (color = MW promedio).
- **Barras apiladas por central** — participación % mensual de las top 10 centrales.
- **Promedio móvil 7d / 30d con banda min–máx** — línea suavizada + banda histórica sombreada.
- **Anomalías** — detecta días fuera de ±2σ de la media móvil de 30 días. Muestra:
  - Tabla de fechas anómalas con MW, desvío y día de la semana.
  - Barras "frecuencia por día de la semana" (dónde caen más anomalías).
  - Barras "frecuencia por mes".

Se agrega selector "vista compacta / detallada" para no saturar en móvil.

## 4. Mapa (`/mapa`)

- Marcadores usan `lat/lng` reales cuando existen; los que no, siguen con el jitter por región (marcados con borde punteado para saber que son aproximados).
- Filtros por: tecnología, sistema (SEIN/COES/AISLADO/OTRO), región.
- Popup enriquecido: código, sistema, potencia, empresa, MW promedio último mes, link al detalle de la central.
- Leyenda de tipos y de "coord real vs aproximada".

## 5. Nueva página `/fuera-sein`

- Lista de todas las centrales con `system` distinto de SEIN/COES.
- KPIs agregados por tipo de tecnología (nº de centrales, potencia instalada total, MW promedio).
- Un gráfico por tecnología: generación diaria agregada (line) y top centrales (bar).
- Sin desglose profundo — es el "análisis rápido" que pediste.

## 6. Comparador multi-año (`/comparador`)

Sin cambios funcionales; solo se agrega un toggle "incluir centrales fuera del SEIN" para que la búsqueda de central alcance a ambos universos.

## 7. Paleta de colores personalizable

- Nueva página `/ajustes` con:
  - Presets predefinidos: **Osinergmin (actual azul/verde)**, **Corporativo oscuro**, **Alto contraste**, **Cálido**.
  - Editor manual: color para cada tecnología (hidro/eólico/solar/térmico), color de acento, color de fondo (claro/oscuro).
  - Preview en vivo.
- La paleta se guarda en `user_settings` (persistente en la nube) y se aplica vía CSS variables en el AppShell.
- Todos los módulos (KPIs, gráficas, mapa, sidebar) leen los colores del contexto de tema, no de constantes hardcodeadas.

## 8. Estructura técnica

- Refactor de `src/lib/centrales.ts`: nuevo tipo `System`, funciones `upsertPlantsFromExcel`, `listPlants({tech, system})`, `getUserSettings`, `saveUserSettings`.
- Nuevo `src/lib/theme.tsx` con `ThemeProvider` que expone la paleta activa y helpers `useTechColor(tech)`.
- Nuevos gráficos como componentes reutilizables en `src/components/charts/` (`DurationCurve`, `MonthYearHeatmap`, `StackedShare`, `MovingAverageBand`, `AnomalyPanel`).
- Nueva ruta `src/routes/fuera-sein.tsx` y `src/routes/ajustes.tsx`.
- Sidebar (`AppShell`) gana entradas: "Fuera del SEIN" y "Ajustes / Paleta".

## Orden de entrega (una sola tanda)

1. Migración (schema + user_settings + precarga de coordenadas conocidas).
2. Refactor de tipos y capa de datos.
3. `ThemeProvider` + página `/ajustes`.
4. Cargadores nuevos en `/cargar` (mediciones con código + coordenadas + estado del maestro).
5. Gráficas nuevas en `/tecnologia/$tech`.
6. Mapa con filtros y coord real vs aproximada.
7. Página `/fuera-sein`.
8. Actualización del sidebar y del comparador.

## Preguntas cerradas (no vuelvo a preguntar)

- Coordenadas: precargo lo público que encuentre + cargador de Excel para lo que falte.
- El Excel de mediciones tendrá columna nueva `Código`; matching por código.
- Sistema (SEIN/COES/AISLADO/OTRO) es un campo editable por central, visible en el maestro.
- Gráficas: curva de duración, heatmap, barras apiladas, banda móvil, y panel de anomalías (con día de la semana y mes).

¿Apruebas para empezar?
