/*
  # Add break_type column to break_logs

  1. Modified Tables
    - `break_logs`
      - Added `break_type` (text) - either 'break' or 'lunch', defaults to 'break'

  2. Notes
    - Existing rows default to 'break'
    - Allows frontend to distinguish between regular breaks and lunch breaks
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'break_logs' AND column_name = 'break_type'
  ) THEN
    ALTER TABLE break_logs ADD COLUMN break_type text NOT NULL DEFAULT 'break';
  END IF;
END $$;