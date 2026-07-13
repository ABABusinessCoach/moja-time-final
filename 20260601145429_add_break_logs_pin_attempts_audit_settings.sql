-- Employee-proposed corrections to shift times
CREATE TABLE IF NOT EXISTS timecard_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timecard_report_id uuid NOT NULL REFERENCES timecard_reports(id) ON DELETE CASCADE,
  clock_log_id uuid REFERENCES clock_logs(id) ON DELETE SET NULL,
  original_clock_in timestamptz,
  original_clock_out timestamptz,
  proposed_clock_in timestamptz,
  proposed_clock_out timestamptz,
  proposed_duration_minutes numeric,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE timecard_corrections ENABLE ROW LEVEL SECURITY;

-- Allow anon + authenticated to insert (employees use anon key via edge fn)
CREATE POLICY "insert_corrections" ON timecard_corrections FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "select_corrections" ON timecard_corrections FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "update_corrections" ON timecard_corrections FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_corrections" ON timecard_corrections FOR DELETE
  TO anon, authenticated USING (true);

-- Index for faster lookups
CREATE INDEX idx_corrections_report ON timecard_corrections(timecard_report_id);
CREATE INDEX idx_corrections_clock_log ON timecard_corrections(clock_log_id);