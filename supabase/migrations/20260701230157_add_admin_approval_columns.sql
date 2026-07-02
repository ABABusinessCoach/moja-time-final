/*
# Add admin approval columns to timecard_reports

1. Modified Tables
   - `timecard_reports`
     - `admin_approved_at` (timestamptz, nullable) - when the admin finalized the report
     - `admin_approved_by` (uuid, nullable) - which admin approved it

2. Notes
   - Supports two-step approval: employee approves (status -> 'employee_approved'),
     then admin approves (status -> 'approved', admin_approved_at/by filled in).
   - The existing 'approved_at' column continues to track when the employee approved.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timecard_reports' AND column_name = 'admin_approved_at'
  ) THEN
    ALTER TABLE timecard_reports ADD COLUMN admin_approved_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timecard_reports' AND column_name = 'admin_approved_by'
  ) THEN
    ALTER TABLE timecard_reports ADD COLUMN admin_approved_by uuid;
  END IF;
END $$;
