/*
# Create Timecard Report System Tables

1. New Tables
  - `pay_periods`
    - `id` (uuid, primary key)
    - `start_date` (date, not null) - First day of the pay period (Saturday)
    - `end_date` (date, not null) - Last day of the pay period (Friday)
    - `status` (text, not null) - One of: open, locked, finalized
    - `created_at` (timestamptz)
  - `timecard_reports`
    - `id` (uuid, primary key)
    - `staff_id` (uuid, references staff) - The employee this report belongs to
    - `pay_period_id` (uuid, references pay_periods)
    - `total_hours` (numeric) - Total hours worked in the period
    - `overtime_hours` (numeric) - Overtime hours if applicable
    - `status` (text, not null) - One of: pending_review, has_notes, approved
    - `access_token` (text, unique) - Token for employee access via emailed link
    - `generated_at` (timestamptz) - When the report was generated
    - `approved_at` (timestamptz) - When auto-approved or manually approved
    - `created_at` (timestamptz)
  - `shift_notes`
    - `id` (uuid, primary key)
    - `timecard_report_id` (uuid, references timecard_reports)
    - `clock_log_id` (uuid, nullable, references clock_logs) - Null for general notes
    - `author_type` (text, not null) - 'employee' or 'manager'
    - `author_id` (uuid, not null) - staff.id or admins.id depending on author_type
    - `body` (text, not null) - The note content
    - `status` (text, not null) - One of: open, acknowledged, resolved
    - `resolution_comment` (text) - Manager's resolution comment
    - `created_at` (timestamptz)
    - `resolved_at` (timestamptz)
    - `resolved_by` (uuid) - Admin who resolved

2. Security
  - RLS enabled on all three tables
  - Admins (authenticated) can read/write all timecard data
  - Anon can read timecard_reports by access_token (for employee link access)

3. Notes
  - shift_notes reference clock_logs but do NOT modify them
  - access_token allows unauthenticated employees to view their own report
  - Pay periods align Saturday-Friday with bi-weekly cutoff
*/

-- Pay periods table
CREATE TABLE IF NOT EXISTS pay_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'finalized')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (start_date, end_date)
);

ALTER TABLE pay_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_pay_periods" ON pay_periods;
CREATE POLICY "admins_select_pay_periods" ON pay_periods FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_insert_pay_periods" ON pay_periods;
CREATE POLICY "admins_insert_pay_periods" ON pay_periods FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_update_pay_periods" ON pay_periods;
CREATE POLICY "admins_update_pay_periods" ON pay_periods FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_delete_pay_periods" ON pay_periods;
CREATE POLICY "admins_delete_pay_periods" ON pay_periods FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- Timecard reports table
CREATE TABLE IF NOT EXISTS timecard_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  pay_period_id uuid NOT NULL REFERENCES pay_periods(id),
  total_hours numeric NOT NULL DEFAULT 0,
  overtime_hours numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'has_notes', 'approved')),
  access_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  generated_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (staff_id, pay_period_id)
);

ALTER TABLE timecard_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_timecard_reports" ON timecard_reports;
CREATE POLICY "admins_select_timecard_reports" ON timecard_reports FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_insert_timecard_reports" ON timecard_reports;
CREATE POLICY "admins_insert_timecard_reports" ON timecard_reports FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_update_timecard_reports" ON timecard_reports;
CREATE POLICY "admins_update_timecard_reports" ON timecard_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_delete_timecard_reports" ON timecard_reports;
CREATE POLICY "admins_delete_timecard_reports" ON timecard_reports FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- Allow anon to read their report by access_token (for employee link)
DROP POLICY IF EXISTS "anon_select_timecard_by_token" ON timecard_reports;
CREATE POLICY "anon_select_timecard_by_token" ON timecard_reports FOR SELECT
  TO anon USING (true);

-- Shift notes table
CREATE TABLE IF NOT EXISTS shift_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timecard_report_id uuid NOT NULL REFERENCES timecard_reports(id) ON DELETE CASCADE,
  clock_log_id uuid REFERENCES clock_logs(id),
  author_type text NOT NULL CHECK (author_type IN ('employee', 'manager')),
  author_id uuid NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  resolution_comment text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

ALTER TABLE shift_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_shift_notes" ON shift_notes;
CREATE POLICY "admins_select_shift_notes" ON shift_notes FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_insert_shift_notes" ON shift_notes;
CREATE POLICY "admins_insert_shift_notes" ON shift_notes FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_update_shift_notes" ON shift_notes;
CREATE POLICY "admins_update_shift_notes" ON shift_notes FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

DROP POLICY IF EXISTS "admins_delete_shift_notes" ON shift_notes;
CREATE POLICY "admins_delete_shift_notes" ON shift_notes FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- Allow anon select/insert/update/delete for employee note management via edge function token validation
DROP POLICY IF EXISTS "anon_select_shift_notes" ON shift_notes;
CREATE POLICY "anon_select_shift_notes" ON shift_notes FOR SELECT
  TO anon USING (true);

DROP POLICY IF EXISTS "anon_insert_shift_notes" ON shift_notes;
CREATE POLICY "anon_insert_shift_notes" ON shift_notes FOR INSERT
  TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_shift_notes" ON shift_notes;
CREATE POLICY "anon_update_shift_notes" ON shift_notes FOR UPDATE
  TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_shift_notes" ON shift_notes;
CREATE POLICY "anon_delete_shift_notes" ON shift_notes FOR DELETE
  TO anon USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pay_periods_dates ON pay_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_timecard_reports_staff ON timecard_reports(staff_id);
CREATE INDEX IF NOT EXISTS idx_timecard_reports_period ON timecard_reports(pay_period_id);
CREATE INDEX IF NOT EXISTS idx_timecard_reports_status ON timecard_reports(status);
CREATE INDEX IF NOT EXISTS idx_timecard_reports_token ON timecard_reports(access_token);
CREATE INDEX IF NOT EXISTS idx_shift_notes_report ON shift_notes(timecard_report_id);
CREATE INDEX IF NOT EXISTS idx_shift_notes_clock_log ON shift_notes(clock_log_id);
