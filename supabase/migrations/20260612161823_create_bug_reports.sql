CREATE TABLE bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  page text,
  reporter_name text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone (anon + authenticated) to insert bug reports
CREATE POLICY "anyone_can_insert_bug_reports" ON bug_reports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- Only authenticated admins can view bug reports
CREATE POLICY "authenticated_can_select_bug_reports" ON bug_reports FOR SELECT
  TO authenticated USING (true);

-- Only authenticated admins can update bug reports
CREATE POLICY "authenticated_can_update_bug_reports" ON bug_reports FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Only authenticated admins can delete bug reports
CREATE POLICY "authenticated_can_delete_bug_reports" ON bug_reports FOR DELETE
  TO authenticated USING (true);