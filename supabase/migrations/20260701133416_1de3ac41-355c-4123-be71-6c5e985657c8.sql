
-- 1. Añadir columna system a plants
ALTER TABLE public.plants
  ADD COLUMN IF NOT EXISTS system text NOT NULL DEFAULT 'SEIN';

ALTER TABLE public.plants
  DROP CONSTRAINT IF EXISTS plants_system_check;
ALTER TABLE public.plants
  ADD CONSTRAINT plants_system_check CHECK (system IN ('SEIN','COES','AISLADO','OTRO'));

-- 2. Código único (para matching en carga)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plants_code_unique'
  ) THEN
    ALTER TABLE public.plants ADD CONSTRAINT plants_code_unique UNIQUE (code);
  END IF;
END $$;

-- 3. Tabla de preferencias (paleta de colores, etc.)
CREATE TABLE IF NOT EXISTS public.user_settings (
  id text PRIMARY KEY,
  palette jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO anon, authenticated;
GRANT ALL ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_all_anon ON public.user_settings;
CREATE POLICY user_settings_all_anon ON public.user_settings
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.user_settings (id, palette)
VALUES ('global', '{"preset":"osinergmin","hidro":"#0ea5e9","eolico":"#10b981","solar":"#f59e0b","termico":"#ef4444","otro":"#94a3b8","accent":"#38bdf8"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 4. Precarga de coordenadas conocidas (upsert por código si existe)
-- Las coordenadas son aproximadas al centro del embalse/parque.
UPDATE public.plants SET lat = -12.4406, lng = -74.9975 WHERE upper(name) LIKE '%MANTARO%' AND lat IS NULL;
UPDATE public.plants SET lat = -12.4319, lng = -74.9500 WHERE upper(name) LIKE '%RESTITUCI%' AND lat IS NULL;
UPDATE public.plants SET lat = -13.1631, lng = -72.5450 WHERE upper(name) LIKE '%MACHUPICCHU%' AND lat IS NULL;
UPDATE public.plants SET lat = -16.3400, lng = -71.4700 WHERE upper(name) LIKE '%CHARCANI%' AND lat IS NULL;
UPDATE public.plants SET lat = -12.5300, lng = -74.6800 WHERE upper(name) LIKE '%CERRO DEL AGUILA%' OR upper(name) LIKE '%CERRO DEL \u00c1GUILA%' AND lat IS NULL;
UPDATE public.plants SET lat = -12.5000, lng = -74.7500 WHERE upper(name) LIKE '%CA\u00d1ON DEL PATO%' OR upper(name) LIKE '%CANON DEL PATO%' AND lat IS NULL;
UPDATE public.plants SET lat = -8.9500, lng = -77.9000 WHERE upper(name) LIKE '%HUANCHOR%' AND lat IS NULL;
UPDATE public.plants SET lat = -11.7800, lng = -76.3900 WHERE upper(name) LIKE '%HUAMPANI%' AND lat IS NULL;
UPDATE public.plants SET lat = -11.8000, lng = -76.4000 WHERE upper(name) LIKE '%CALLAHUANCA%' AND lat IS NULL;
UPDATE public.plants SET lat = -11.7700, lng = -76.4200 WHERE upper(name) LIKE '%MOYOPAMPA%' AND lat IS NULL;
UPDATE public.plants SET lat = -11.7500, lng = -76.4400 WHERE upper(name) LIKE '%MATUCANA%' AND lat IS NULL;
UPDATE public.plants SET lat = -13.5000, lng = -74.7000 WHERE upper(name) LIKE '%SAN GABAN%' OR upper(name) LIKE '%SAN GAB\u00c1N%' AND lat IS NULL;
UPDATE public.plants SET lat = -15.1700, lng = -75.1000 WHERE upper(name) LIKE '%MARCONA%' AND lat IS NULL;
UPDATE public.plants SET lat = -14.1667, lng = -75.7333 WHERE upper(name) LIKE '%TRES HERMANAS%' AND lat IS NULL;
UPDATE public.plants SET lat = -8.2000, lng = -79.0000 WHERE upper(name) LIKE '%CUPISNIQUE%' AND lat IS NULL;
UPDATE public.plants SET lat = -5.7500, lng = -80.6800 WHERE upper(name) LIKE '%TALARA%' AND upper(name) LIKE '%EOL%' AND lat IS NULL;
UPDATE public.plants SET lat = -14.2000, lng = -75.7500 WHERE upper(name) LIKE '%WAYRA%' AND lat IS NULL;
UPDATE public.plants SET lat = -6.2500, lng = -78.9500 WHERE upper(name) LIKE '%HUAMBOS%' AND lat IS NULL;
UPDATE public.plants SET lat = -6.2300, lng = -78.9700 WHERE upper(name) LIKE '%DUNA%' AND lat IS NULL;
UPDATE public.plants SET lat = -14.0800, lng = -75.7800 WHERE upper(name) LIKE '%PUNTA LOMITAS%' AND lat IS NULL;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.touch_user_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_user_settings_touch ON public.user_settings;
CREATE TRIGGER trg_user_settings_touch BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_settings();
