/*
  # Add break tracking, security, audit, and settings tables

  1. New Tables
    - `break_logs` - Tracks break periods within a clock shift
      - `id` (uuid, primary key)
      - `clock_log_id` (uuid, FK to clock_logs)
      - `staff_id` (uuid, FK to staff)
      - `break_start` (timestamptz, required)
      - `break_end` (timestamptz, nullable)
      - `duration_minutes` (numeric, nullable - calculated on break end)
      - `created_at` (timestamptz)
    - `pin_attempts` - Rate limiting for PIN attempts
      - `id` (uuid, primary key)
      - `ip_address` (text)
      - `attempted_at` (timestamptz)
      - `success` (boolean)
      - `created_at` (timestamptz)
    - `audit_log` - Tracks admin manual corrections
      - `id` (uuid, primary key)
      - `admin_id` (uuid, FK to admins)
      - `action` (text - manual_edit, manual_add, manual_delete, force_clock_out)
      - `target_staff_id` (uuid, FK to staff)
      - `clock_log_id` (uuid, nullable FK to clock_logs)
      - `old_values` (jsonb, nullable)
      - `new_values` (jsonb, nullable)
      - `reason` (text, required)
      - `created_at` (timestamptz)
    - `app_settings` - Configurable application settings
      - `id` (uuid, primary key)
      - `key` (text, unique)
      - `value` (jsonb)
      - `updated_at` (timestamptz)

  2. Modified Tables
    - `clock_logs` - Added `notes` (text) and `flagged` (boolean) columns

  3. Security
    - Enable RLS on all new tables
    - Admins can read/write break_logs, audit_log, app_settings
    - pin_attempts accessible via service role only (edge function)
    - Staff can view their own break_logs via edge function

  4. Seed Data
    - Default app_settings for overtime thresholds and shift limits
*/

-- Break logs table
CREATE TABLE IF NOT EXISTS break_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clock_log_id uuid NOT NULL REFERENCES clock_logs(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  break_start timestamptz NOT NULL,
  break_end timestamptz,
  duration_minutes numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE break_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all break logs"
  ON break_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

CREATE POLICY "Admins can insert break logs"
  ON break_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

CREATE POLICY "Admins can update break logs"
  ON break_logs FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

CREATE POLICY "Admins can delete break logs"
  ON break_logs FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- PIN attempts table (for rate limiting)
CREATE TABLE IF NOT EXISTS pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL DEFAULT '',
  attempted_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pin_attempts ENABLE ROW LEVEL SECURITY;

-- No RLS policies for pin_attempts - only accessible via service role in edge functions

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES admins(id),
  action text NOT NULL,
  target_staff_id uuid REFERENCES staff(id),
  clock_log_id uuid REFERENCES clock_logs(id) ON DELETE SET NULL,
  old_values jsonb,
  new_values jsonb,
  reason text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON audit_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

CREATE POLICY "Admins can insert audit log"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- App settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

CREATE POLICY "Admins can update settings"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

CREATE POLICY "Admins can insert settings"
  ON app_settings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

CREATE POLICY "Anon can read settings"
  ON app_settings FOR SELECT
  TO anon
  USING (key IN ('overtime_weekly_threshold', 'overtime_daily_threshold', 'max_shift_hours'));

-- Add notes and flagged columns to clock_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clock_logs' AND column_name = 'notes'
  ) THEN
    ALTER TABLE clock_logs ADD COLUMN notes text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clock_logs' AND column_name = 'flagged'
  ) THEN
    ALTER TABLE clock_logs ADD COLUMN flagged boolean DEFAULT false;
  END IF;
END $$;

-- Add is_on_break to staff table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'is_on_break'
  ) THEN
    ALTER TABLE staff ADD COLUMN is_on_break boolean DEFAULT false;
  END IF;
END $$;

-- Seed default settings
INSERT INTO app_settings (key, value) VALUES
  ('overtime_weekly_threshold', '40'::jsonb),
  ('overtime_daily_threshold', 'null'::jsonb),
  ('max_shift_hours', '12'::jsonb),
  ('auto_clock_out_hours', '16'::jsonb),
  ('expected_start_time', '"09:00"'::jsonb),
  ('daily_summary_email', 'false'::jsonb),
  ('overtime_warning_threshold', '35'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_break_logs_clock_log_id ON break_logs(clock_log_id);
CREATE INDEX IF NOT EXISTS idx_break_logs_staff_id ON break_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_pin_attempts_ip_time ON pin_attempts(ip_address, attempted_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_staff ON audit_log(target_staff_id, created_at);
CREATE INDEX IF NOT EXISTS idx_clock_logs_flagged ON clock_logs(flagged) WHERE flagged = true;
