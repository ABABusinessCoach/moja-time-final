/*
# Add break time columns to timecard_corrections

1. Modified Tables
   - `timecard_corrections`
     - `original_break_start` (timestamptz, nullable) - original break out time
     - `original_break_end` (timestamptz, nullable) - original break in time
     - `proposed_break_start` (timestamptz, nullable) - proposed break out time
     - `proposed_break_end` (timestamptz, nullable) - proposed break in time

2. Notes
   - These columns allow employees to propose edits to their lunch/break times
   - All columns are nullable since not every shift has a break
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timecard_corrections' AND column_name = 'original_break_start') THEN
    ALTER TABLE timecard_corrections ADD COLUMN original_break_start timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timecard_corrections' AND column_name = 'original_break_end') THEN
    ALTER TABLE timecard_corrections ADD COLUMN original_break_end timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timecard_corrections' AND column_name = 'proposed_break_start') THEN
    ALTER TABLE timecard_corrections ADD COLUMN proposed_break_start timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'timecard_corrections' AND column_name = 'proposed_break_end') THEN
    ALTER TABLE timecard_corrections ADD COLUMN proposed_break_end timestamptz;
  END IF;
END $$;