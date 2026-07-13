/*
# Add employee_number column to staff table

1. Modified Tables
   - `staff`
     - Added `employee_number` (text, nullable) - A unique identifier/number assigned to each employee

2. Notes
   - Column is nullable so existing staff records are unaffected
   - No unique constraint since some orgs may not assign numbers to all employees
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'employee_number'
  ) THEN
    ALTER TABLE staff ADD COLUMN employee_number text;
  END IF;
END $$;