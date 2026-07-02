
-- plants
DROP POLICY IF EXISTS plants_all_anon ON public.plants;
CREATE POLICY plants_select_public ON public.plants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY plants_write_auth ON public.plants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY plants_update_auth ON public.plants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY plants_delete_auth ON public.plants FOR DELETE TO authenticated USING (true);

-- measurements
DROP POLICY IF EXISTS measurements_all_anon ON public.measurements;
CREATE POLICY measurements_select_public ON public.measurements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY measurements_write_auth ON public.measurements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY measurements_update_auth ON public.measurements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY measurements_delete_auth ON public.measurements FOR DELETE TO authenticated USING (true);

-- data_uploads
DROP POLICY IF EXISTS uploads_all_anon ON public.data_uploads;
CREATE POLICY uploads_select_public ON public.data_uploads FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY uploads_write_auth ON public.data_uploads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY uploads_update_auth ON public.data_uploads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY uploads_delete_auth ON public.data_uploads FOR DELETE TO authenticated USING (true);

-- user_settings
DROP POLICY IF EXISTS user_settings_all_anon ON public.user_settings;
CREATE POLICY user_settings_select_public ON public.user_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY user_settings_write_auth ON public.user_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY user_settings_update_auth ON public.user_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY user_settings_delete_auth ON public.user_settings FOR DELETE TO authenticated USING (true);
