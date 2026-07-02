
-- plants
DROP POLICY IF EXISTS plants_write_auth ON public.plants;
DROP POLICY IF EXISTS plants_update_auth ON public.plants;
DROP POLICY IF EXISTS plants_delete_auth ON public.plants;
CREATE POLICY plants_insert_auth ON public.plants FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY plants_update_auth ON public.plants FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY plants_delete_auth ON public.plants FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- measurements
DROP POLICY IF EXISTS measurements_write_auth ON public.measurements;
DROP POLICY IF EXISTS measurements_update_auth ON public.measurements;
DROP POLICY IF EXISTS measurements_delete_auth ON public.measurements;
CREATE POLICY measurements_insert_auth ON public.measurements FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY measurements_update_auth ON public.measurements FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY measurements_delete_auth ON public.measurements FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- data_uploads
DROP POLICY IF EXISTS uploads_write_auth ON public.data_uploads;
DROP POLICY IF EXISTS uploads_update_auth ON public.data_uploads;
DROP POLICY IF EXISTS uploads_delete_auth ON public.data_uploads;
CREATE POLICY uploads_insert_auth ON public.data_uploads FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY uploads_update_auth ON public.data_uploads FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY uploads_delete_auth ON public.data_uploads FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- user_settings
DROP POLICY IF EXISTS user_settings_write_auth ON public.user_settings;
DROP POLICY IF EXISTS user_settings_update_auth ON public.user_settings;
DROP POLICY IF EXISTS user_settings_delete_auth ON public.user_settings;
CREATE POLICY user_settings_insert_auth ON public.user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY user_settings_update_auth ON public.user_settings FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY user_settings_delete_auth ON public.user_settings FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
