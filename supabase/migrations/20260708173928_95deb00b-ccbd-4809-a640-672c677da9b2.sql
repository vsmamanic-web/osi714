
-- 1) Asegurar cascada al borrar plants
ALTER TABLE public.measurements
  DROP CONSTRAINT IF EXISTS measurements_plant_id_fkey;
ALTER TABLE public.measurements
  ADD  CONSTRAINT measurements_plant_id_fkey
       FOREIGN KEY (plant_id) REFERENCES public.plants(id) ON DELETE CASCADE;

-- 2) Asegurar unique (plant_id, date) para permitir upsert
CREATE UNIQUE INDEX IF NOT EXISTS measurements_plant_id_date_key
  ON public.measurements (plant_id, date);

-- 3) Limpiar registros basura donde code = name (eólicos)
DELETE FROM public.plants
  WHERE technology = 'eolico'
    AND upper(trim(code)) = upper(trim(name));
