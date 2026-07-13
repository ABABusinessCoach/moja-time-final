/*
# Fix timecard_reports status check constraint

1. Modified Tables
   - `timecard_reports`: Updated check constraint to include 'employee_approved' status

2. Problem
   - The existing constraint only allows: 'pending_review', 'has_notes', 'approved'
   - The application code uses 'employee_approved' as an intermediate status between
     employee self-approval and admin final approval
   - This causes the employee approval step to fail with a constraint violation

3. Fix
   - Drop the old constraint and recreate it with all four valid statuses:
     'pending_review', 'has_notes', 'employee_approved', 'approved'
*/

ALTER TABLE timecard_reports DROP CONSTRAINT IF EXISTS timecard_reports_status_check;

ALTER TABLE timecard_reports ADD CONSTRAINT timecard_reports_status_check
  CHECK (status = ANY (ARRAY['pending_review'::text, 'has_notes'::text, 'employee_approved'::text, 'approved'::text]));
