ALTER TABLE public.measurements ADD COLUMN IF NOT EXISTS upload_id uuid REFERENCES public.data_uploads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_measurements_upload_id ON public.measurements(upload_id);
ALTER TABLE public.data_uploads ADD COLUMN IF NOT EXISTS reverted_at timestamp with time zone;