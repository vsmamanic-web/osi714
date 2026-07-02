# Mejoras al panel eléctrico

## 1. Plantillas Excel descargables

Botón **"Descargar plantilla"** en `/cargar` que genera un `.xlsx` con las columnas exactas y una hoja "Instrucciones". Dos plantillas:

**Plantilla de MEDICIONES** (para actualizar MW diarios de Hidro/Eólico/Solar/Térmico):

| Columna | Obligatorio | Descripción |
|---|---|---|
| `codigo` | **Sí** | Código único de la central (evita duplicados) |
| `nombre` | Sí (primera vez) | Nombre; ignorado si el código ya existe |
| `fecha` | **Sí** | Formato `YYYY-MM-DD` o fecha Excel |
| `mw` | **Sí** | Potencia diaria en MW (numérico) |

Regla anti-duplicados: el matching es **por `codigo`** (no por nombre). Si el código existe → actualiza mediciones. Si no existe → crea nueva central con la tecnología del formulario. Nombres distintos con el mismo código NO crean central nueva.

**Plantilla de CENTRALES (maestro)** — columnas: `codigo, nombre, tecnologia, sistema, empresa, region, potencia_instalada_mw, lat, lng`.

Hoja "Instrucciones" con: orden, campos obligatorios, ejemplos, valores válidos (`hidro|eolico|solar|termico|otro`, `SEIN|COES|AISLADO|OTRO`).

## 2. Botón "Deshacer última carga"

En `/cargar`, tabla de últimas subidas con botón **Revertir** por fila. Al pulsar:
- Borra las `measurements` insertadas en esa carga (rango `[uploaded_at - 5min, uploaded_at + 5min]` por plantas tocadas), y
- Marca la entrada como revertida en `data_uploads`.

Para hacerlo confiable, se añade columna `measurements.upload_id` (FK a `data_uploads.id`) y se registra en cada inserción. Revertir = `DELETE FROM measurements WHERE upload_id = ?`. Los datos previos quedan intactos.

## 3. Selector de año + granularidad (D/S/M) en TODOS los módulos

Barra de filtros compartida (componente `ChartControls`) en Hidro/Eólico/Solar/Térmico/Fuera-SEIN:
- Multi-select de años (chips activables, todos por defecto)
- Toggle de granularidad: **Diario · Semanal · Mensual**

Todos los gráficos de la sección (evolución, curva de duración, heatmap, participación, anomalías) respetan estos filtros. Se corrige el bug actual donde solo se ve un año.

## 4. Comparador — nuevo gráfico multi-central

Se mantiene el gráfico actual (una central, varios años superpuestos día del año).

**Nuevo bloque**: "Promedio de varias centrales vs años"
- Multi-select de centrales (chips: `Central 1 ×`, `Central 2 ×`, …)
- Multi-select de años
- Toggle Diario · Semanal · Mensual
- Series: una línea por año, cada valor = **promedio de MW** de las centrales seleccionadas en ese día/semana/mes del año
- Si una central no tiene dato en una fecha, se promedia solo con las que sí tienen y se muestra un aviso: "Central X sin datos completos en 2024 (faltan N días); el promedio usa solo las centrales con datos."
- Tooltip: promedio + n° de centrales aportantes
- Tabla resumen: Δ absoluta y Δ % entre años

## 5. Paleta Osinergmin llamativa

Se añade preset **"Osinergmin Vivo"** como default:
- Hidro: `#0090D4` (azul Osinergmin)
- Eólico: `#00B140` (verde vivo)
- Solar: `#FFC20E` (amarillo)
- Térmico: `#E4002B` (rojo)
- Otro: `#6C2C91` (violeta institucional)
- Accent: `#00B7C7` (cian)

Sigue siendo cambiable en `/ajustes`.

## Cambios técnicos (resumen)

- **Migración SQL**: añadir `measurements.upload_id uuid REFERENCES data_uploads(id) ON DELETE CASCADE`, índice por `upload_id`, columna `data_uploads.reverted_at`.
- `src/lib/centrales.ts`: aceptar/guardar `upload_id`, función `revertUpload(id)`, funciones para generar plantillas con `xlsx`.
- Nuevo `src/components/ChartControls.tsx` (años + granularidad) + helper `aggregate(meas, granularity)`.
- `src/routes/tecnologia.$tech.tsx`, `fuera-sein.tsx`: integrar controles.
- `src/routes/comparador.tsx`: añadir bloque multi-central + toggle granularidad al gráfico existente.
- `src/routes/cargar.tsx`: botones "Descargar plantilla mediciones", "Descargar plantilla centrales", tabla de cargas con "Revertir".
- `src/lib/theme.tsx`: nuevo preset Osinergmin como default.

¿Procedo con la implementación?
