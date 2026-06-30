
CREATE TABLE public.plants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  technology text NOT NULL CHECK (technology IN ('hidro','eolico','solar','termico','otro')),
  company text,
  region text,
  installed_mw numeric,
  lat numeric,
  lng numeric,
  status text DEFAULT 'operativo',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plants TO anon, authenticated;
GRANT ALL ON public.plants TO service_role;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plants_all_anon" ON public.plants FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.measurements (
  id bigserial PRIMARY KEY,
  plant_id uuid NOT NULL REFERENCES public.plants(id) ON DELETE CASCADE,
  date date NOT NULL,
  mw numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plant_id, date)
);
CREATE INDEX measurements_plant_date_idx ON public.measurements(plant_id, date);
CREATE INDEX measurements_date_idx ON public.measurements(date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurements TO anon, authenticated;
GRANT ALL ON public.measurements TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.measurements_id_seq TO anon, authenticated, service_role;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "measurements_all_anon" ON public.measurements FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.data_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  technology text NOT NULL,
  filename text,
  rows_inserted integer NOT NULL DEFAULT 0,
  plants_touched integer NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_uploads TO anon, authenticated;
GRANT ALL ON public.data_uploads TO service_role;
ALTER TABLE public.data_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "uploads_all_anon" ON public.data_uploads FOR ALL USING (true) WITH CHECK (true);
